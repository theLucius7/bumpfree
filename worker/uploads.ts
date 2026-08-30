import { Buffer } from "node:buffer";
import type { Env, UserRow } from "./types";
import { HttpError, rateLimit, readBody } from "./security";
import { requireAdmin, requireUser } from "./data";
import { extractScheduleFileText } from "../lib/utils/scheduleFiles";
const MAX_FILE_SIZE = 2 * 1024 * 1024;
export async function upload(
  request: Request,
  env: Env,
  current: UserRow | null,
  extract = false,
) {
  const user = requireUser(current);
  await rateLimit(
    env,
    "upload:" + user.id,
    extract ? 30 : 10,
    extract ? 3600000 : 86400000,
  );
  const bytes = await readBody(
    request,
    (extract ? 5 : 2) * 1024 * 1024 + 256 * 1024,
  );
  const form = await new Response(bytes, {
    headers: { "Content-Type": request.headers.get("content-type") || "" },
  }).formData();
  const file = form.get("file");
  if (extract) {
    if (!(file instanceof File)) throw new HttpError(400, "请选择文件");
    return { text: await extractScheduleFileText(file) };
  }
  const text = String(form.get("text") || "").trim();
  if (text.length > 50000) throw new HttpError(400, "文本不能超过50,000字符");
  const attachment =
    file instanceof File && file.size ? await normalizeAttachment(file) : null;
  if (!text && !attachment) throw new HttpError(400, "请填写说明或上传文件");
  const id = crypto.randomUUID();
  const statements = [
    env.DB.prepare(
      "INSERT INTO manual_schedule_submissions(id,user_id,text_content,file_name,file_type,file_size) VALUES(?,?,?,?,?,?)",
    ).bind(
      id,
      user.id,
      text || null,
      attachment?.fileName || null,
      attachment?.fileType || null,
      attachment?.fileSize || null,
    ),
  ];
  if (attachment)
    for (
      let offset = 0, index = 0;
      offset < attachment.buffer.length;
      offset += 128 * 1024, index++
    ) {
      const chunk = attachment.buffer.subarray(offset, offset + 128 * 1024);
      statements.push(
        env.DB.prepare(
          "INSERT INTO attachment_chunks(submission_id,chunk_index,data) VALUES(?,?,?)",
        ).bind(id, index, chunk),
      );
    }
  await env.DB.batch(statements);
  return { success: true };
}
export async function attachmentResponse(
  env: Env,
  current: UserRow | null,
  id: string,
) {
  requireAdmin(current);
  const meta = await env.DB.prepare(
    "SELECT file_name,file_type,file_size FROM manual_schedule_submissions WHERE id=?",
  )
    .bind(id)
    .first<{ file_name: string; file_type: string; file_size: number }>();
  if (!meta?.file_name) throw new HttpError(404, "附件不存在");
  const { results } = await env.DB.prepare(
    "SELECT data FROM attachment_chunks WHERE submission_id=? ORDER BY chunk_index",
  )
    .bind(id)
    .all<{ data: number[] }>();
  const bytes = new Uint8Array(meta.file_size);
  let offset = 0;
  for (const row of results) {
    bytes.set(row.data, offset);
    offset += row.data.length;
  }
  if (offset !== meta.file_size) throw new HttpError(503, "附件存储不完整");
  return new Response(bytes, {
    headers: {
      "Content-Type": meta.file_type,
      "Content-Disposition":
        "attachment; filename*=UTF-8''" + encodeURIComponent(meta.file_name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
export async function normalizeAttachment(file: File) {
  if (file.size > MAX_FILE_SIZE) throw new Error("文件不能超过 2MB");

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  let fileType: string;

  if (isPng(buffer)) fileType = "image/png";
  else if (isJpeg(buffer)) fileType = "image/jpeg";
  else if (isWebP(buffer)) fileType = "image/webp";
  else if (
    [".txt", ".html", ".htm"].includes(extension) ||
    file.type.startsWith("text/")
  ) {
    if (buffer.includes(0)) throw new Error("文本附件包含不支持的二进制内容");
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw new Error("文本附件必须使用 UTF-8 编码");
    }
    fileType =
      extension === ".html" || extension === ".htm"
        ? "text/html"
        : "text/plain";
  } else {
    throw new Error("只支持 TXT、HTML、PNG、JPG 和 WEBP 文件");
  }

  const fileName = (file.name.split(/[\\/]/).pop() || "schedule-submission")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 255);

  return {
    fileName,
    fileType,
    fileSize: file.size,
    buffer,
  };
}

function isPng(buffer: Buffer) {
  return (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  );
}

function isJpeg(buffer: Buffer) {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function isWebP(buffer: Buffer) {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}
