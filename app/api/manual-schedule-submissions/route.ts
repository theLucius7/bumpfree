import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasTrustedRequestOrigin } from "@/lib/auth/request-origin";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 256 * 1024;
const MAX_TEXT_LENGTH = 50_000;

export async function POST(request: NextRequest) {
    if (!hasTrustedRequestOrigin(request)) {
        return NextResponse.json({ error: "请求来源不合法" }, { status: 403 });
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (!contentLengthHeader) {
        return NextResponse.json({ error: "请求必须包含 Content-Length" }, { status: 411 });
    }
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
        return NextResponse.json({ error: "请求大小不合法" }, { status: 400 });
    }
    if (contentLength > MAX_REQUEST_SIZE) {
        return NextResponse.json({ error: "文件不能超过 2MB" }, { status: 413 });
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    try {
        const formData = await request.formData();
        const text = String(formData.get("text") ?? "").trim();
        if (text.length > MAX_TEXT_LENGTH) {
            return NextResponse.json({ error: "文本不能超过 50,000 字符" }, { status: 400 });
        }

        const file = formData.get("file");
        const filePayload = file instanceof File && file.size > 0
            ? await normalizeAttachment(file)
            : null;

        if (!text && !filePayload) {
            return NextResponse.json({ error: "请填写文本说明或上传图片/文本文件" }, { status: 400 });
        }

        const { error } = await supabase.from("manual_schedule_submissions").insert({
            user_id: user.id,
            text_content: text || null,
            file_name: filePayload?.fileName ?? null,
            file_type: filePayload?.fileType ?? null,
            file_size: filePayload?.fileSize ?? null,
            file_data: filePayload?.fileData ?? null,
        });

        if (error) {
            return NextResponse.json(
                { error: "提交失败；每位用户最多保留 5 条待处理、每天最多提交 10 条" },
                { status: 400 }
            );
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : "提交失败";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

async function normalizeAttachment(file: File) {
    if (file.size > MAX_FILE_SIZE) throw new Error("文件不能超过 2MB");

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    let fileType: string;

    if (isPng(buffer)) fileType = "image/png";
    else if (isJpeg(buffer)) fileType = "image/jpeg";
    else if (isWebP(buffer)) fileType = "image/webp";
    else if ([".txt", ".html", ".htm"].includes(extension) || file.type.startsWith("text/")) {
        if (buffer.includes(0)) throw new Error("文本附件包含不支持的二进制内容");
        try {
            new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
            throw new Error("文本附件必须使用 UTF-8 编码");
        }
        fileType = extension === ".html" || extension === ".htm" ? "text/html" : "text/plain";
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
        fileData: buffer.toString("base64"),
    };
}

function isPng(buffer: Buffer) {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(buffer: Buffer) {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isWebP(buffer: Buffer) {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}
