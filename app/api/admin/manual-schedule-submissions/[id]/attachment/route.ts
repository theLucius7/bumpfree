import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: rawId } = await params;
    const id = z.string().uuid().safeParse(rawId);
    if (!id.success) return new NextResponse("Not found", { status: 404 });

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if (profile?.role !== "superadmin") return new NextResponse("Forbidden", { status: 403 });

    const { data: submission } = await supabase
        .from("manual_schedule_submissions")
        .select("file_name,file_type,file_size,file_data")
        .eq("id", id.data)
        .single();
    if (!submission?.file_data) return new NextResponse("Not found", { status: 404 });

    const buffer = Buffer.from(submission.file_data, "base64");
    if (buffer.length !== submission.file_size || buffer.length > 2 * 1024 * 1024) {
        return new NextResponse("Invalid attachment", { status: 422 });
    }

    const fileName = (submission.file_name || "schedule-submission")
        .replace(/[\r\n"\\]/g, "_")
        .slice(0, 255);
    const asciiFileName = fileName.replace(/[^\x20-\x7e]/g, "_");
    const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );

    return new NextResponse(new Uint8Array(buffer), {
        headers: {
            "Cache-Control": "private, no-store",
            "Content-Length": String(buffer.length),
            "Content-Disposition": `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedName}`,
            "Content-Security-Policy": "sandbox; default-src 'none'",
            "Content-Type": submission.file_type || "application/octet-stream",
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
