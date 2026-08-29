"use server";

import { createClient } from "@/lib/supabase/server";
import {
    MAX_SCHEDULE_COURSES,
    MAX_SCHEDULE_TEXT_LENGTH,
    MAX_SCHEDULE_WEEKS,
    parseTextSchedule,
    validateParsedTextSchedule,
    type ParsedTextSchedule,
    type TextScheduleImportMode,
} from "@/lib/utils/textSchedule";
import { extractWakeUpKey, parseWakeUpResponse } from "@/lib/utils/wakeup";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const shortOptionalText = z.preprocess(
    (value) => value === null || value === undefined ? undefined : value,
    z.string().trim().max(120).optional(),
);

const manualCourseSlotSchema = z.object({
    room: shortOptionalText,
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    startTime: clockSchema,
    endTime: clockSchema,
    startWeek: z.coerce.number().int().min(1).max(MAX_SCHEDULE_WEEKS),
    endWeek: z.coerce.number().int().min(1).max(MAX_SCHEDULE_WEEKS),
}).refine((slot) => slot.endTime > slot.startTime, { message: "end_after_start" })
    .refine((slot) => slot.endWeek >= slot.startWeek, { message: "week_range" });

const manualCourseSchema = z.object({
    scheduleId: uuidSchema,
    name: z.string().trim().min(1).max(200),
    room: shortOptionalText,
    teacher: shortOptionalText,
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    startTime: clockSchema,
    endTime: clockSchema,
    startWeek: z.coerce.number().int().min(1).max(MAX_SCHEDULE_WEEKS),
    endWeek: z.coerce.number().int().min(1).max(MAX_SCHEDULE_WEEKS),
}).refine((course) => course.endTime > course.startTime, { message: "end_after_start" })
    .refine((course) => course.endWeek >= course.startWeek, { message: "week_range" });

const addManualCourseSchema = z.object({
    scheduleId: uuidSchema,
    name: z.string().trim().min(1).max(200),
    teacher: shortOptionalText,
    slots: z.array(manualCourseSlotSchema).min(1).max(12),
});

const updateCourseSchema = manualCourseSchema.safeExtend({
    courseId: uuidSchema,
});

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ExistingSchedule = {
    id: string;
    start_date: string;
    max_weeks: number;
};

export async function importTextSchedule(text: string, importModeOverride?: TextScheduleImportMode) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "\u8bf7\u5148\u767b\u5f55" };
    if (typeof text !== "string" || text.length > MAX_SCHEDULE_TEXT_LENGTH) return { error: "课表文本过长或格式不正确" };

    let parsed: ParsedTextSchedule;
    try {
        parsed = parseTextSchedule(text);
    } catch (e) {
        return { error: e instanceof Error ? e.message : "\u89e3\u6790\u8bfe\u8868\u5931\u8d25" };
    }

    const importMode = importModeOverride ?? parsed.importMode;
    if (!["replace", "append", "new"].includes(importMode)) return { error: "\u5bfc\u5165\u65b9\u5f0f\u4e0d\u652f\u6301" };

    return persistParsedSchedule(supabase, user.id, parsed, importMode);
}

/** Import a WakeUp share message or 32-character key without exposing the API to the browser. */
export async function importWakeUpSchedule(token: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };
    if (typeof token !== "string" || token.length > 5_000) return { error: "WakeUp 口令格式不正确" };

    const key = extractWakeUpKey(token);
    if (!key) return { error: "无法识别口令，请粘贴完整分享消息或 32 位口令" };

    let rawText: string;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(`https://i.wakeup.fun/share_schedule/get?key=${encodeURIComponent(key)}`, {
            cache: "no-store",
            signal: controller.signal,
        });
        if (!response.ok) throw new Error("WakeUp API 暂时无响应");
        const body = await readResponseText(response, 2_000_000);
        const envelope = JSON.parse(body) as { status?: unknown; data?: unknown };
        if (envelope.status !== 1 || typeof envelope.data !== "string") throw new Error("口令无效或已过期");
        rawText = envelope.data;
    } catch (error) {
        const message = error instanceof Error && error.name === "AbortError"
            ? "WakeUp API 请求超时，请重试"
            : error instanceof Error ? error.message : "获取 WakeUp 课表失败";
        return { error: message };
    } finally {
        clearTimeout(timeout);
    }

    let parsed: ParsedTextSchedule;
    try {
        const wakeUp = parseWakeUpResponse(rawText);
        parsed = validateParsedTextSchedule({
            format: "strict",
            semesterTag: wakeUp.semesterTag,
            startDate: wakeUp.startDate,
            timezone: "Asia/Shanghai",
            maxWeeks: wakeUp.maxWeeks,
            school: wakeUp.school,
            importMode: "replace",
            courses: wakeUp.courses,
            warnings: [],
        });
    } catch (error) {
        return { error: `解析 WakeUp 课表失败：${error instanceof Error ? error.message : "未知错误"}` };
    }

    return persistParsedSchedule(supabase, user.id, parsed, "replace");
}

async function persistParsedSchedule(
    supabase: SupabaseClient,
    userId: string,
    parsedInput: ParsedTextSchedule,
    importMode: TextScheduleImportMode,
) {
    let parsed: ParsedTextSchedule;
    try {
        parsed = validateParsedTextSchedule(parsedInput);
    } catch (error) {
        return { error: error instanceof Error ? error.message : "课表数据格式不正确" };
    }

    const [profileResult, countResult, existingResult] = await Promise.all([
        supabase.from("profiles").select("schedule_quota").eq("id", userId).maybeSingle(),
        supabase.from("schedules").select("*", { count: "exact", head: true }).eq("user_id", userId),
        supabase
            .from("schedules")
            .select("id, start_date, max_weeks")
            .eq("user_id", userId)
            .eq("semester_tag", parsed.semesterTag)
            .maybeSingle(),
    ]);

    if (profileResult.error || !profileResult.data || typeof profileResult.data.schedule_quota !== "number") {
        return { error: "无法读取课表额度，请稍后重试" };
    }
    if (countResult.error || countResult.count === null) return { error: "无法统计已保存课表，请稍后重试" };
    if (existingResult.error) return { error: "无法检查同名课表，请稍后重试" };

    const existingSchedule = existingResult.data as ExistingSchedule | null;

    const needsNewSchedule = importMode === "new" || !existingSchedule;
    if (needsNewSchedule && countResult.count >= profileResult.data.schedule_quota) {
        return { error: `课表数量已达到上限：${profileResult.data.schedule_quota} 份` };
    }

    let semesterTag = parsed.semesterTag;
    if (importMode === "new") {
        try {
            semesterTag = await getUniqueSemesterTag(supabase, userId, parsed.semesterTag);
        } catch {
            return { error: "无法生成唯一的课表名称，请先删除不再需要的同名副本" };
        }
    }

    const scheduleId = existingSchedule && importMode !== "new" ? existingSchedule.id : crypto.randomUUID();
    const courseRows = parsed.courses.map((course) => ({
        id: crypto.randomUUID(),
        schedule_id: scheduleId,
        user_id: userId,
        name: course.name,
        room: course.room || null,
        teacher: course.teacher || null,
        day_of_week: course.dayOfWeek,
        start_time: course.startTime,
        end_time: course.endTime,
        start_week: course.startWeek,
        end_week: course.endWeek,
        color: course.color,
    }));

    if (!existingSchedule || importMode === "new") {
        const { error: scheduleError } = await supabase.from("schedules").insert({
            id: scheduleId,
            user_id: userId,
            semester_tag: semesterTag,
            school: parsed.school || null,
            start_date: parsed.startDate,
            max_weeks: parsed.maxWeeks,
            // Keep the previous active schedule intact until the new courses are
            // fully saved and the final activation step succeeds.
            is_active: false,
            wakeup_raw: null,
        });
        if (scheduleError) return { error: `保存课表失败：${scheduleError.message}` };

        const { error: insertError } = await supabase.from("courses").insert(courseRows);
        if (insertError) {
            await supabase.from("schedules").delete().eq("id", scheduleId).eq("user_id", userId);
            return { error: `导入课程失败：${insertError.message}` };
        }

        const activationFailed = await activateOnlySchedule(supabase, userId, scheduleId);
        if (activationFailed) {
            // Do not compensate here: a network failure can be reported after
            // PostgreSQL already committed the atomic activation trigger.
            return { error: "课表已保存，但无法确认当前课表状态；请刷新后检查" };
        }
    } else if (importMode === "append") {
        if (parsed.startDate !== existingSchedule.start_date || parsed.maxWeeks > existingSchedule.max_weeks) {
            return { error: "追加导入必须与原课表使用相同的 StartDate，且周次不能超过原课表 MaxWeeks；请改用覆盖导入" };
        }
        const countResult = await supabase
            .from("courses")
            .select("*", { count: "exact", head: true })
            .eq("schedule_id", existingSchedule.id)
            .eq("user_id", userId);
        if (countResult.error || countResult.count === null) return { error: "无法统计原课表课程，未执行追加" };
        if (countResult.count + courseRows.length > MAX_SCHEDULE_COURSES) {
            return { error: `每份课表最多 ${MAX_SCHEDULE_COURSES} 条课程，未执行追加` };
        }
        // Append intentionally does not change school/start_date/max_weeks/imported_at.
        const { error: insertError } = await supabase.from("courses").insert(courseRows);
        if (insertError) return { error: `追加课程失败：${insertError.message}` };
    } else {
        const { data: replacedCount, error: replaceError } = await supabase.rpc(
            "replace_schedule_courses",
            {
                p_schedule_id: existingSchedule.id,
                p_school: parsed.school || null,
                p_start_date: parsed.startDate,
                p_max_weeks: parsed.maxWeeks,
                p_courses: courseRows.map((course) => ({
                    id: course.id,
                    name: course.name,
                    room: course.room,
                    teacher: course.teacher,
                    day_of_week: course.day_of_week,
                    start_time: course.start_time,
                    end_time: course.end_time,
                    start_week: course.start_week,
                    end_week: course.end_week,
                    color: course.color,
                })),
            }
        );
        if (replaceError || replacedCount !== courseRows.length) {
            return { error: "覆盖导入失败，原课表未改变" };
        }
    }

    revalidatePath("/dashboard/profile");
    return {
        success: true,
        semesterTag,
        courseCount: courseRows.length,
        warnings: parsed.warnings,
    };
}

async function getUniqueSemesterTag(supabase: SupabaseClient, userId: string, baseTag: string) {
    const { data } = await supabase
        .from("schedules")
        .select("semester_tag")
        .eq("user_id", userId);
    const existing = new Set((data ?? []).map((row) => row.semester_tag));
    if (!existing.has(baseTag)) return baseTag;
    for (let index = 2; index <= 102; index++) {
        const suffix = ` copy ${index}`;
        const candidate = `${baseTag.slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
        if (!existing.has(candidate)) return candidate;
    }
    throw new Error("无法生成唯一学期名称");
}

async function activateOnlySchedule(
    supabase: SupabaseClient,
    userId: string,
    scheduleId: string,
) {
    const { data: activated, error } = await supabase
        .from("schedules")
        .update({ is_active: true })
        .eq("id", scheduleId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
    return Boolean(error || !activated);
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) throw new Error("WakeUp 返回数据过大");
    if (!response.body) return "";

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new Error("WakeUp 返回数据过大");
        }
        chunks.push(value);
    }
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(combined);
}

/**
 * Manually add a single course to an existing schedule.
 */
export async function addManualCourse(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "\u8bf7\u5148\u767b\u5f55" };

    const parsed = addManualCourseSchema.safeParse({
        scheduleId: formData.get("scheduleId"),
        name: formData.get("name"),
        teacher: formData.get("teacher"),
        slots: parseManualCourseSlots(formData),
    });

    if (!parsed.success) return { error: "\u8bf7\u68c0\u67e5\u8bfe\u7a0b\u65f6\u95f4\u6bb5" };

    const ownedSchedule = await getOwnedSchedule(supabase, user.id, parsed.data.scheduleId);
    if (!ownedSchedule) return { error: "课表不存在或无权修改" };
    if (parsed.data.slots.some((slot) => slot.endWeek > ownedSchedule.max_weeks)) {
        return { error: `课程周次不能超过课表的 ${ownedSchedule.max_weeks} 周` };
    }
    const countResult = await supabase
        .from("courses")
        .select("*", { count: "exact", head: true })
        .eq("schedule_id", ownedSchedule.id)
        .eq("user_id", user.id);
    if (countResult.error || countResult.count === null) return { error: "无法统计课表课程，请稍后重试" };
    if (countResult.count + parsed.data.slots.length > MAX_SCHEDULE_COURSES) {
        return { error: `每份课表最多 ${MAX_SCHEDULE_COURSES} 条课程` };
    }

    const rows = parsed.data.slots.map((slot) => ({
        schedule_id: parsed.data.scheduleId,
        user_id: user.id,
        name: parsed.data.name,
        room: slot.room || null,
        teacher: parsed.data.teacher || null,
        day_of_week: slot.dayOfWeek,
        start_time: slot.startTime,
        end_time: slot.endTime,
        start_week: slot.startWeek,
        end_week: slot.endWeek,
    }));

    const { error } = await supabase.from("courses").insert(rows);
    if (error) return { error: `\u6dfb\u52a0\u8bfe\u7a0b\u5931\u8d25\uff1a${error.message}` };
    revalidatePath("/dashboard/profile");
    return { success: true, courseCount: rows.length };
}

function parseManualCourseSlots(formData: FormData) {
    const slotsJson = formData.get("slotsJson");
    if (typeof slotsJson === "string" && slotsJson.trim()) {
        if (slotsJson.length > 20_000) return [];
        try {
            const parsed = JSON.parse(slotsJson) as unknown;
            if (Array.isArray(parsed)) return parsed;
        } catch {
            return [];
        }
    }

    return [{
        room: formData.get("room"),
        dayOfWeek: formData.get("dayOfWeek"),
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime"),
        startWeek: formData.get("startWeek"),
        endWeek: formData.get("endWeek"),
    }];
}

/**
 * Update a single course by ID.
 */
export async function updateCourse(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };

    const parsed = updateCourseSchema.safeParse({
        courseId: formData.get("courseId"),
        scheduleId: formData.get("scheduleId"),
        name: formData.get("name"),
        room: formData.get("room"),
        teacher: formData.get("teacher"),
        dayOfWeek: formData.get("dayOfWeek"),
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime"),
        startWeek: formData.get("startWeek"),
        endWeek: formData.get("endWeek"),
    });

    if (!parsed.success) return { error: "请检查输入格式" };

    const ownedSchedule = await getOwnedSchedule(supabase, user.id, parsed.data.scheduleId);
    if (!ownedSchedule) return { error: "课表不存在或无权修改" };
    if (parsed.data.endWeek > ownedSchedule.max_weeks) {
        return { error: `课程周次不能超过课表的 ${ownedSchedule.max_weeks} 周` };
    }

    const { data: updated, error } = await supabase
        .from("courses")
        .update({
            schedule_id: parsed.data.scheduleId,
            name: parsed.data.name,
            room: parsed.data.room || null,
            teacher: parsed.data.teacher || null,
            day_of_week: parsed.data.dayOfWeek,
            start_time: parsed.data.startTime,
            end_time: parsed.data.endTime,
            start_week: parsed.data.startWeek,
            end_week: parsed.data.endWeek,
        })
        .eq("id", parsed.data.courseId)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();

    if (error || !updated) return { error: "课程不存在或更新失败" };
    revalidatePath("/dashboard/profile");
    return { success: true };
}

/**
 * Delete a course by ID.
 */
export async function deleteCourse(courseId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };
    if (!uuidSchema.safeParse(courseId).success) return { error: "课程 ID 格式不正确" };

    const { data: deleted, error } = await supabase
        .from("courses")
        .delete()
        .eq("id", courseId)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();

    if (error || !deleted) return { error: "课程不存在或删除失败" };
    revalidatePath("/dashboard/profile");
    return { success: true };
}

/**
 * Get all schedules for the current user.
 */
export async function getMySchedules() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
        .from("schedules")
        .select("*, courses(*)")
        .eq("user_id", user.id)
        .order("imported_at", { ascending: false });

    return data ?? [];
}

/**
 * Set a schedule as active (deactivates others).
 */
export async function setActiveSchedule(scheduleId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };
    if (!uuidSchema.safeParse(scheduleId).success) return { error: "课表 ID 格式不正确" };
    const ownedSchedule = await getOwnedSchedule(supabase, user.id, scheduleId);
    if (!ownedSchedule) return { error: "课表不存在或无权修改" };

    const activationFailed = await activateOnlySchedule(supabase, user.id, scheduleId);
    if (activationFailed) return { error: "无法确认当前课表状态，请刷新后检查" };
    revalidatePath("/dashboard/profile");
    return { success: true };
}

/**
 * Delete an entire schedule and its courses.
 */
export async function deleteSchedule(scheduleId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };
    if (!uuidSchema.safeParse(scheduleId).success) return { error: "课表 ID 格式不正确" };
    const ownedSchedule = await getOwnedSchedule(supabase, user.id, scheduleId);
    if (!ownedSchedule) return { error: "课表不存在或无权修改" };

    const { error } = await supabase
        .from("schedules")
        .delete()
        .eq("id", scheduleId)
        .eq("user_id", user.id);

    if (error) return { error: "删除课表失败" };

    if (ownedSchedule.is_active) {
        const { data: replacement, error: replacementError } = await supabase
            .from("schedules")
            .select("id")
            .eq("user_id", user.id)
            .order("imported_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (replacementError) return { error: "课表已删除，但无法选择新的当前课表；请刷新后检查" };
        if (replacement && await activateOnlySchedule(supabase, user.id, replacement.id)) {
            return { error: "课表已删除，但无法确认新的当前课表；请刷新后检查" };
        }
    }

    revalidatePath("/dashboard/profile");
    return { success: true };
}

async function getOwnedSchedule(supabase: SupabaseClient, userId: string, scheduleId: string) {
    const { data, error } = await supabase
        .from("schedules")
        .select("id, max_weeks, is_active")
        .eq("id", scheduleId)
        .eq("user_id", userId)
        .maybeSingle();
    if (error || !data || !Number.isInteger(data.max_weeks) || data.max_weeks < 1 || data.max_weeks > MAX_SCHEDULE_WEEKS) {
        return null;
    }
    return data as { id: string; max_weeks: number; is_active: boolean };
}
