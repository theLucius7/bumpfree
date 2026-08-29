"use server";

import { createClient } from "@/lib/supabase/server";
import { parseRescheduleNotice } from "@/lib/utils/rescheduleNotice";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const busyBlockSchema = z.object({
    title: z.string().trim().min(1).max(80),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    note: z.string().trim().max(1000).optional(),
    roomId: z.string().uuid().optional(),
}).strict();

const uuidSchema = z.string().uuid();
const MAX_BUSY_DURATION_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_BUSY_BLOCKS_PER_USER = 1_000;

function rangeError(startsAt: string, endsAt: string) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "\u65f6\u95f4\u683c\u5f0f\u4e0d\u6b63\u786e";
    if (start.getUTCFullYear() < 2000 || start.getUTCFullYear() > 2100
        || end.getUTCFullYear() < 2000 || end.getUTCFullYear() > 2100) return "时间必须在 2000-2100 年之间";
    if (end <= start) return "\u7ed3\u675f\u65f6\u95f4\u5fc5\u987b\u665a\u4e8e\u5f00\u59cb\u65f6\u95f4";
    if (end.getTime() - start.getTime() > MAX_BUSY_DURATION_MS) return "单条 busy 时间不能超过 31 天";
    return null;
}

export async function addBusyBlock(input: z.input<typeof busyBlockSchema>) {
    const parsed = busyBlockSchema.safeParse(input);
    if (!parsed.success) return { error: "\u8bf7\u68c0\u67e5\u5360\u7528\u65f6\u95f4" };
    const invalid = rangeError(parsed.data.startsAt, parsed.data.endsAt);
    if (invalid) return { error: invalid };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "\u8bf7\u5148\u767b\u5f55" };
    const capacityError = await busyCapacityError(supabase, user.id);
    if (capacityError) return { error: capacityError };
    const { error } = await supabase.from("busy_blocks").insert({ user_id: user.id, title: parsed.data.title, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt, note: parsed.data.note || null, source: "manual" });
    if (error) return { error: `\u6dfb\u52a0\u5360\u7528\u5931\u8d25\uff1a${error.message}` };
    if (parsed.data.roomId) revalidatePath(`/room/${parsed.data.roomId}`);
    revalidatePath("/dashboard/profile");
    return { success: true };
}

export async function deleteBusyBlock(id: string, roomId?: string) {
    if (!uuidSchema.safeParse(id).success) return { error: "busy ID 格式不正确" };
    if (roomId !== undefined && !uuidSchema.safeParse(roomId).success) return { error: "Room ID 格式不正确" };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "\u8bf7\u5148\u767b\u5f55" };
    const { data: deleted, error } = await supabase.from("busy_blocks").delete().eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
    if (error || !deleted) return { error: "busy 不存在或删除失败" };
    if (roomId) revalidatePath(`/room/${roomId}`);
    revalidatePath("/dashboard/profile");
    return { success: true };
}

export async function importRescheduleNotice(text: string) {
    if (typeof text !== "string" || text.length > 20_000) return { error: "\u901a\u77e5\u6587\u672c\u8fc7\u957f\u6216\u683c\u5f0f\u4e0d\u6b63\u786e" };
    let notice;
    try { notice = parseRescheduleNotice(text); } catch (e) { return { error: e instanceof Error ? e.message : "\u89e3\u6790\u8c03\u8bfe\u901a\u77e5\u5931\u8d25" }; }
    const invalid = rangeError(notice.startsAt, notice.endsAt);
    if (invalid) return { error: invalid };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "\u8bf7\u5148\u767b\u5f55" };
    const capacityError = await busyCapacityError(supabase, user.id);
    if (capacityError) return { error: capacityError };
    const { error } = await supabase.from("busy_blocks").insert({
        user_id: user.id,
        title: `\u8c03\u8bfe\uff1a${notice.courseName}`,
        starts_at: new Date(notice.startsAt).toISOString(),
        ends_at: new Date(notice.endsAt).toISOString(),
        note: [notice.teacher && `Teacher: ${notice.teacher}`, notice.room && `Room: ${notice.room}`, notice.note].filter(Boolean).join("\n") || null,
        source: "reschedule",
    });
    if (error) return { error: `\u5bfc\u5165\u8c03\u8bfe\u901a\u77e5\u5931\u8d25\uff1a${error.message}` };
    revalidatePath("/dashboard/profile");
    return { success: true, notice };
}

async function busyCapacityError(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
    const { count, error } = await supabase
        .from("busy_blocks")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
    if (error || count === null) return "无法统计 busy 记录，请稍后重试";
    return count >= MAX_BUSY_BLOCKS_PER_USER ? `每位用户最多保留 ${MAX_BUSY_BLOCKS_PER_USER} 条 busy 记录` : null;
}
