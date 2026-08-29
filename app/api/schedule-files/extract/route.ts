import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractScheduleFileText, MAX_SCHEDULE_FILE_SIZE } from "@/lib/utils/scheduleFiles";
import { hasTrustedRequestOrigin } from "@/lib/auth/request-origin";

export const runtime = "nodejs";

const MAX_REQUEST_SIZE = MAX_SCHEDULE_FILE_SIZE + 256 * 1024;

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
        return NextResponse.json({ error: "文件不能超过 5MB" }, { status: 413 });
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "请选择文件" }, { status: 400 });
        }

        const text = await extractScheduleFileText(file);
        return NextResponse.json({ text });
    } catch (error) {
        const message = error instanceof Error ? error.message : "文件文本抽取失败";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
