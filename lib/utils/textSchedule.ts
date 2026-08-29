import { MEMBER_COLORS } from "@/lib/utils/colors";

export type TextScheduleImportMode = "replace" | "append" | "new";

export interface TextScheduleCourse {
    name: string;
    teacher: string;
    room: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startWeek: number;
    endWeek: number;
    note?: string;
    color: string;
}

export interface ParsedTextSchedule {
    format: "strict" | "loose";
    semesterTag: string;
    startDate: string;
    timezone: string;
    maxWeeks: number;
    school: string;
    importMode: TextScheduleImportMode;
    courses: TextScheduleCourse[];
    warnings: string[];
}

export interface ParseTextScheduleOptions {
    adapterKey?: string;
}

export const MAX_SCHEDULE_TEXT_LENGTH = 100_000;
export const MAX_SCHEDULE_COURSES = 500;
export const MAX_SCHEDULE_WEEKS = 30;

const MAX_SEMESTER_TAG_LENGTH = 80;
const MAX_SCHOOL_LENGTH = 120;
const MAX_TIMEZONE_LENGTH = 80;
const MAX_COURSE_NAME_LENGTH = 200;
const MAX_COURSE_DETAIL_LENGTH = 120;
const MAX_COURSE_NOTE_LENGTH = 500;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const DAY_MAP: Record<string, number> = {
    monday: 1,
    mon: 1,
    "\u5468\u4e00": 1,
    "\u661f\u671f\u4e00": 1,
    tuesday: 2,
    tue: 2,
    "\u5468\u4e8c": 2,
    "\u661f\u671f\u4e8c": 2,
    wednesday: 3,
    wed: 3,
    "\u5468\u4e09": 3,
    "\u661f\u671f\u4e09": 3,
    thursday: 4,
    thu: 4,
    "\u5468\u56db": 4,
    "\u661f\u671f\u56db": 4,
    friday: 5,
    fri: 5,
    "\u5468\u4e94": 5,
    "\u661f\u671f\u4e94": 5,
    saturday: 6,
    sat: 6,
    "\u5468\u516d": 6,
    "\u661f\u671f\u516d": 6,
    sunday: 7,
    sun: 7,
    "\u5468\u65e5": 7,
    "\u5468\u5929": 7,
    "\u661f\u671f\u65e5": 7,
    "\u661f\u671f\u5929": 7,
};

const STRICT_HEADER = "BumpFree Schedule Import v1";

export function parseTextSchedule(input: string, options: ParseTextScheduleOptions = {}): ParsedTextSchedule {
    if (options.adapterKey && options.adapterKey !== "generic-text") {
        throw new Error("学校专用导入接口请通过 scheduleAdapterRegistry 调用");
    }
    return parseGenericTextSchedule(input);
}

export function parseGenericTextSchedule(input: string): ParsedTextSchedule {
    const text = normalizeText(input);
    if (!text.trim()) throw new Error("\u8bf7\u5148\u7c98\u8d34\u8bfe\u8868\u6587\u672c");
    const parsed = looksLikeHtmlSchedule(text)
        ? parseHtmlSchedule(text)
        : text.includes(STRICT_HEADER)
            ? parseStrictSchedule(text)
            : parseLooseSchedule(text);
    return validateParsedTextSchedule(parsed);
}

export function parseXmuHtmlSchedule(input: string): ParsedTextSchedule {
    const text = normalizeText(input);
    if (!text.trim()) throw new Error("\u8bf7\u5148\u7c98\u8d34\u8bfe\u8868\u6587\u672c");
    if (!looksLikeHtmlSchedule(text)) throw new Error("请上传或粘贴厦马 HTML 课表");
    return validateParsedTextSchedule({
        ...parseHtmlSchedule(text),
        school: "厦门大学马来西亚分校",
    });
}

export function parseSwpuPdfTextSchedule(input: string): ParsedTextSchedule {
    const text = normalizeText(input);
    if (!text.trim()) throw new Error("\u8bf7\u5148\u7c98\u8d34\u8bfe\u8868\u6587\u672c");
    return validateParsedTextSchedule(parseSwpuScheduleText(text));
}

/**
 * Runtime validation shared by every import adapter, including data returned by
 * third-party APIs. This must remain stricter than the database column types.
 */
export function validateParsedTextSchedule(parsed: ParsedTextSchedule): ParsedTextSchedule {
    if (!parsed || typeof parsed !== "object") throw new Error("课表数据格式不正确");
    if (parsed.format !== "strict" && parsed.format !== "loose") throw new Error("课表格式标记不正确");
    if (parsed.importMode !== "replace" && parsed.importMode !== "append" && parsed.importMode !== "new") {
        throw new Error("ImportMode 只支持 replace、append 或 new");
    }

    const semesterTag = boundedText(parsed.semesterTag, "Semester", MAX_SEMESTER_TAG_LENGTH, true);
    const school = boundedText(parsed.school, "School", MAX_SCHOOL_LENGTH, false);
    const timezone = boundedText(parsed.timezone, "Timezone", MAX_TIMEZONE_LENGTH, true);
    validateIsoDate(parsed.startDate, "StartDate");
    if (!isMondayIsoDate(parsed.startDate)) throw new Error("StartDate 必须是第 1 周的周一");
    if (!Number.isInteger(parsed.maxWeeks) || parsed.maxWeeks < 1 || parsed.maxWeeks > MAX_SCHEDULE_WEEKS) {
        throw new Error(`MaxWeeks 必须是 1-${MAX_SCHEDULE_WEEKS} 之间的整数`);
    }
    if (!Array.isArray(parsed.courses) || parsed.courses.length < 1) throw new Error("没有识别到课程");
    if (parsed.courses.length > MAX_SCHEDULE_COURSES) {
        throw new Error(`单次最多导入 ${MAX_SCHEDULE_COURSES} 条课程`);
    }

    const courses = parsed.courses.map((course, index) => {
        if (!course || typeof course !== "object") throw new Error(`第 ${index + 1} 条课程格式不正确`);
        const label = `第 ${index + 1} 条课程`;
        const name = boundedText(course.name, `${label}名称`, MAX_COURSE_NAME_LENGTH, true);
        const teacher = boundedText(course.teacher, `${label}教师`, MAX_COURSE_DETAIL_LENGTH, false);
        const room = boundedText(course.room, `${label}教室`, MAX_COURSE_DETAIL_LENGTH, false);
        const note = course.note === undefined
            ? undefined
            : boundedText(course.note, `${label}备注`, MAX_COURSE_NOTE_LENGTH, false);
        if (!Number.isInteger(course.dayOfWeek) || course.dayOfWeek < 1 || course.dayOfWeek > 7) {
            throw new Error(`${label}星期必须是 1-7`);
        }
        if (typeof course.startTime !== "string" || typeof course.endTime !== "string"
            || !CLOCK_PATTERN.test(course.startTime) || !CLOCK_PATTERN.test(course.endTime) || course.endTime <= course.startTime) {
            throw new Error(`${label}时间必须是有效的 HH:mm 范围`);
        }
        if (!Number.isInteger(course.startWeek) || !Number.isInteger(course.endWeek)
            || course.startWeek < 1 || course.endWeek < course.startWeek
            || course.endWeek > parsed.maxWeeks || course.endWeek > MAX_SCHEDULE_WEEKS) {
            throw new Error(`${label}周次必须在 1-${parsed.maxWeeks} 周内`);
        }
        if (typeof course.color !== "string" || !/^#[0-9a-f]{6}$/i.test(course.color)) {
            throw new Error(`${label}颜色必须是 #rrggbb 格式`);
        }
        return { ...course, name, teacher, room, note, color: course.color.toLowerCase() };
    });

    if (!Array.isArray(parsed.warnings) || parsed.warnings.length > 50
        || parsed.warnings.some((warning) => typeof warning !== "string" || warning.length > 500)) {
        throw new Error("课表警告信息格式不正确");
    }

    return { ...parsed, semesterTag, school, timezone, courses };
}

export function getScheduleTemplate(): string {
    return `${STRICT_HEADER}
Semester: 2026/04
StartDate: 2026-04-06
Timezone: Asia/Shanghai
MaxWeeks: 14
School: Manual Import
ImportMode: replace

---
Day: Monday
Time: 10:00-12:00
Name: CST402* - ARM Assembly Language
Teacher: Mohammed N. M. Ali
Room: A3#602
Weeks: 1-14

---
Day: Monday
Time: 13:00-14:00
Name: CST402* - ARM Assembly Language
Teacher: Mohammed N. M. Ali
Room: A1#G10
Weeks: 1-14`;
}

export function getAiCleanupPrompt(): string {
    return `请把下面的课表整理成 BumpFree Schedule Import v1 格式。
只输出可导入文本，不要解释，不要 Markdown 代码块。

全局字段必须放在最前面：
BumpFree Schedule Import v1
Semester: 2026/04
StartDate: 2026-04-06
Timezone: Asia/Shanghai
MaxWeeks: 14
School: Manual Import
ImportMode: replace

课程块要求：
- 每个上课时间段单独一个课程块，课程块之间必须用一整行 --- 分隔
- Day 使用 Monday、Tuesday、Wednesday、Thursday、Friday、Saturday、Sunday
- Time 使用 24 小时制 HH:mm-HH:mm，例如 08:00-10:00
- Name 保留课程代码和课程名，建议格式：SOF106 - Principles of Artificial Intelligence
- Teacher 没有就留空：Teacher:
- Room 没有就留空：Room:
- Weeks 使用 1-14 或 1-8,10-14；不要写 Week 1-14 的括号原文
- 如果同一门课有多个时间段，重复输出多个课程块，不要合并
- 手机 OCR/复制内容里如果课程名、教室、周次粘在一起，要拆成 Name、Room、Weeks 三个字段
- 不确定 StartDate 时，不要猜具体日期；先输出 TODO_START_DATE 并提醒用户替换

课程块模板：
---
Day: Monday
Time: 10:00-12:00
Name: CST402 - ARM Assembly Language
Teacher: Mohammed N. M. Ali
Room: A3#602
Weeks: 1-14

原始课表：
[粘贴在这里]`;
}

function parseStrictSchedule(text: string): ParsedTextSchedule {
    const warnings: string[] = [];
    const parts = splitStrictBlocks(text);
    const header = parts.shift();
    if (!header?.includes(STRICT_HEADER)) throw new Error("\u7f3a\u5c11 BumpFree Schedule Import v1 \u6807\u5934");

    const globalFields = parseFields(header.replace(STRICT_HEADER, ""));
    const semesterTag = requireField(globalFields, "semester", "Semester");
    const startDate = requireField(globalFields, "startdate", "StartDate");
    validateIsoDate(startDate, "StartDate");

    const timezone = globalFields.get("timezone") || "Asia/Shanghai";
    const school = globalFields.get("school") || "Manual Import";
    const importMode = parseImportMode(globalFields.get("importmode"));
    const courses = parts.flatMap((block, index) => parseStrictCourseBlock(block, index + 1));
    if (courses.length === 0) throw new Error("\u6ca1\u6709\u8bc6\u522b\u5230\u8bfe\u7a0b");

    const inferredMaxWeek = Math.max(...courses.map((course) => course.endWeek));
    const maxWeeks = parsePositiveInt(globalFields.get("maxweeks") || String(inferredMaxWeek), "MaxWeeks");
    for (const course of courses) {
        if (course.endWeek > maxWeeks) throw new Error(`\u8bfe\u7a0b${course.name}\u7684\u5468\u6b21\u8d85\u8fc7 MaxWeeks`);
    }

    return { format: "strict", semesterTag, startDate, timezone, maxWeeks, school, importMode, courses, warnings };
}

function splitStrictBlocks(text: string): string[] {
    const blocks: string[] = [];
    let current: string[] = [];
    const fieldLine = /^(day|time|name|teacher|room|weeks|note|color)\s*[:\uFF1A]/i;

    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        const startsCourse = /^day\s*[:\uFF1A]/i.test(line);
        if (startsCourse && current.some((item) => fieldLine.test(item.trim()) || item.includes(STRICT_HEADER))) {
            blocks.push(current.join("\n").trim());
            current = [];
        }
        if (/^---+$/.test(line)) {
            if (current.join("\n").trim()) blocks.push(current.join("\n").trim());
            current = [];
            continue;
        }
        if (!line || isBrokenSeparatorLine(line)) continue;
        current.push(rawLine);
    }

    if (current.join("\n").trim()) blocks.push(current.join("\n").trim());
    return blocks.filter(Boolean);
}

function isBrokenSeparatorLine(line: string): boolean {
    if (line.length > 8) return false;
    if (/^[\W_]+$/.test(line)) return true;
    return /[�]/.test(line);
}

function parseStrictCourseBlock(block: string, blockIndex: number): TextScheduleCourse[] {
    const fields = parseFields(block);
    const dayOfWeek = parseDay(requireField(fields, "day", `\u7b2c ${blockIndex} \u4e2a\u8bfe\u7a0b\u5757\u7f3a\u5c11 Day`));
    const [startTime, endTime] = parseTimeRange(requireField(fields, "time", `\u7b2c ${blockIndex} \u4e2a\u8bfe\u7a0b\u5757\u7f3a\u5c11 Time`));
    const name = requireField(fields, "name", `\u7b2c ${blockIndex} \u4e2a\u8bfe\u7a0b\u5757\u7f3a\u5c11 Name`);
    const teacher = fields.get("teacher") || "";
    const room = fields.get("room") || "";
    const note = fields.get("note") || undefined;
    const ranges = parseWeeks(requireField(fields, "weeks", `\u7b2c ${blockIndex} \u4e2a\u8bfe\u7a0b\u5757\u7f3a\u5c11 Weeks`));
    const color = parseColor(fields.get("color")) || colorForCourse(name);

    return ranges.map(([startWeek, endWeek]) => ({ name, teacher, room, dayOfWeek, startTime, endTime, startWeek, endWeek, note, color }));
}

function parseLooseSchedule(text: string): ParsedTextSchedule {
    const warnings: string[] = [];
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const semesterLine = lines.find((line) => /^semester\s*[:\uFF1A]/i.test(line));
    const semesterTag = semesterLine ? valueAfterColon(semesterLine) : inferDefaultSemesterTag();
    if (!semesterTag) throw new Error("Semester \u4e0d\u80fd\u4e3a\u7a7a");

    let startDate = "";
    const startDateLine = lines.find((line) => /^startdate\s*[:\uFF1A]/i.test(line));
    if (startDateLine) {
        startDate = valueAfterColon(startDateLine);
        validateIsoDate(startDate, "StartDate");
    } else {
        startDate = inferFirstMondayFromSemester(semesterTag);
        warnings.push(`${semesterLine ? "\u672a\u63d0\u4f9b StartDate" : "\u672a\u63d0\u4f9b Semester/StartDate"}\uff0c\u5df2\u6839\u636e ${semesterTag} \u63a8\u65ad\u7b2c\u4e00\u4e2a\u5468\u4e00\u4e3a ${startDate}`);
    }

    const courses: TextScheduleCourse[] = [];
    let currentDay: number | null = null;

    for (let i = 0; i < lines.length; i++) {
        const compactCourse = parseCompactCourseLine(lines[i]);
        if (compactCourse) {
            courses.push(...compactCourse);
            continue;
        }

        const maybeDay = parseDayOrNull(lines[i]);
        if (maybeDay) {
            currentDay = maybeDay;
            continue;
        }
        if (!currentDay || !looksLikeTimeRange(lines[i])) {
            const orphanTail = parseCourseTail(lines[i]);
            const nextCompact = parseCompactCourseParts(lines[i + 1] || "");
            if (orphanTail && nextCompact && orphanTail.name === nextCompact.tail.name && orphanTail.room === nextCompact.tail.room) {
                for (const [startWeek, endWeek] of parseWeeks(orphanTail.weeks)) {
                    courses.push({ name: orphanTail.name, teacher: "", room: orphanTail.room, dayOfWeek: nextCompact.dayOfWeek, startTime: nextCompact.startTime, endTime: nextCompact.endTime, startWeek, endWeek, color: colorForCourse(orphanTail.name) });
                }
                continue;
            }
            if (orphanTail && !isMetadataLine(lines[i])) {
                warnings.push(`已跳过信息不完整的行：${lines[i]}（缺少星期和时间）`);
            }
            continue;
        }

        const [startTime, endTime] = parseTimeRange(lines[i]);
        const compactTail = parseCourseTail(lines[i + 1] || "");
        if (compactTail) {
            for (const [startWeek, endWeek] of parseWeeks(compactTail.weeks)) {
                courses.push({ name: compactTail.name, teacher: "", room: compactTail.room, dayOfWeek: currentDay, startTime, endTime, startWeek, endWeek, color: colorForCourse(compactTail.name) });
            }
            i += 1;
            continue;
        }

        const name = lines[i + 1]?.trim();
        if (!name || isMetadataLine(name) || looksLikeTimeRange(name)) throw new Error(`\u7b2c ${i + 1} \u884c\u65f6\u95f4\u540e\u7f3a\u5c11\u8bfe\u7a0b\u540d`);

        const teacherLine = lines[i + 2] || "";
        const roomLine = lines[i + 3] || "";
        const weekLine = lines[i + 4] || "";
        const teacher = /^lecturer\s*[:\uFF1A]|^teacher\s*[:\uFF1A]/i.test(teacherLine) ? valueAfterColon(teacherLine) : "";
        const room = /^venue\s*[:\uFF1A]|^room\s*[:\uFF1A]/i.test(roomLine) ? valueAfterColon(roomLine) : "";
        if (!/^week\s*[:\uFF1A]|^weeks\s*[:\uFF1A]/i.test(weekLine)) throw new Error(`\u8bfe\u7a0b${name}\u7f3a\u5c11 Week \u5b57\u6bb5`);

        const ranges = parseWeeks(valueAfterColon(weekLine));
        const cleanName = name.replace(/\s+[\u2014-]\s+/g, " - ");
        for (const [startWeek, endWeek] of ranges) {
            courses.push({ name: cleanName, teacher, room, dayOfWeek: currentDay, startTime, endTime, startWeek, endWeek, color: colorForCourse(cleanName) });
        }
        i += 4;
    }

    if (courses.length === 0) throw new Error("\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u5bfc\u5165\u8bfe\u7a0b\uff1b\u677e\u6563\u683c\u5f0f\u81f3\u5c11\u9700\u8981 Semester\u3001\u661f\u671f\u3001\u65f6\u95f4\u3001\u8bfe\u7a0b\u540d\u548c\u5468\u6b21");
    const maxWeeks = Math.max(...courses.map((course) => course.endWeek));
    return { format: "loose", semesterTag, startDate, timezone: "Asia/Shanghai", maxWeeks, school: "Manual Import", importMode: "replace", courses, warnings };
}

function normalizeText(input: string): string {
    if (typeof input !== "string") throw new Error("课表文本格式不正确");
    if (input.length > MAX_SCHEDULE_TEXT_LENGTH) throw new Error(`课表文本不能超过 ${MAX_SCHEDULE_TEXT_LENGTH} 个字符`);
    return input
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .replace(/[\uFF0D\u2013\u2014]/g, "-")
        .replace(/[\u00a0\u2007\u202F]/g, " ");
}

function looksLikeHtmlSchedule(text: string): boolean {
    return /<table[\s>]/i.test(text) && /<t[dh][\s>]/i.test(text) && /rowspan|<br\s*\/?>|Week\s+\d/i.test(text);
}

function parseHtmlSchedule(text: string): ParsedTextSchedule {
    const warnings: string[] = [];
    const rows = Array.from(text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
    const occupied = Array(7).fill(0) as number[];
    const courses: TextScheduleCourse[] = [];

    for (const row of rows) {
        const cells = Array.from(row.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)).map((match) => ({
            tag: match[1].toLowerCase(),
            attrs: match[2],
            html: match[3],
        }));
        if (cells.length < 2 || cells[0].tag !== "td") continue;

        const rowTime = cellText(cells[0].html);
        const startTime = parseHtmlStartTime(rowTime);
        if (!startTime) continue;

        let dayIndex = 0;
        for (const cell of cells.slice(1)) {
            while (dayIndex < 7 && occupied[dayIndex] > 0) dayIndex += 1;
            if (dayIndex >= 7) break;

            const rowspan = parseRowspan(cell.attrs);
            const details = parseHtmlCourseCell(cell.html);
            if (details) {
                const endTime = addHours(startTime, rowspan);
                const ranges = parseWeeks(details.weeks);
                for (const [startWeek, endWeek] of ranges) {
                    courses.push({
                        name: details.name,
                        teacher: details.teacher,
                        room: details.room,
                        dayOfWeek: dayIndex + 1,
                        startTime,
                        endTime,
                        startWeek,
                        endWeek,
                        color: colorForCourse(details.name),
                    });
                }
            }

            // The counters are decremented at the end of this row. Store the full
            // rowspan here so the following rowspan - 1 rows remain occupied.
            if (rowspan > 1) occupied[dayIndex] = Math.max(occupied[dayIndex], rowspan);
            dayIndex += 1;
        }

        for (let index = 0; index < occupied.length; index++) {
            if (occupied[index] > 0) occupied[index] -= 1;
        }
    }

    if (courses.length === 0) throw new Error("没有识别到 HTML 课表中的课程");
    const semesterTag = inferDefaultSemesterTag();
    const startDate = inferFirstMondayFromSemester(semesterTag);
    warnings.push(`HTML 课表未提供 Semester/StartDate，已根据 ${semesterTag} 推断第一周周一为 ${startDate}`);
    return {
        format: "loose",
        semesterTag,
        startDate,
        timezone: "Asia/Shanghai",
        maxWeeks: Math.max(...courses.map((course) => course.endWeek)),
        school: "Manual Import",
        importMode: "replace",
        courses,
        warnings,
    };
}

function parseHtmlCourseCell(html: string): { name: string; teacher: string; room: string; weeks: string } | null {
    const lines = html
        .replace(/<br\s*\/?>/gi, "\n")
        .split("\n")
        .map((line) => cellText(line))
        .filter((line) => line && line !== "&nbsp;");

    if (lines.length < 4) return null;
    const weekLine = lines.find((line) => /\bWeek\s+\d/i.test(line) || /周次?\s*\d/.test(line));
    if (!weekLine) return null;
    const weeks = weekLine.replace(/[()]/g, "").replace(/^(Week|Weeks|周次?)\s*/i, "").trim();
    const code = lines[0];
    const title = lines[1] || "";
    return {
        name: title ? `${code} - ${title}` : code,
        teacher: lines[2] || "",
        room: lines[3] || "",
        weeks,
    };
}

const SWPU_PERIOD_TIMES: Record<number, [string, string]> = {
    1: ["08:00", "08:45"],
    2: ["08:50", "09:35"],
    3: ["09:50", "10:35"],
    4: ["10:40", "11:25"],
    5: ["11:30", "12:15"],
    6: ["14:30", "15:15"],
    7: ["15:20", "16:05"],
    8: ["16:20", "17:05"],
    9: ["17:10", "17:55"],
    10: ["19:00", "19:45"],
    11: ["19:50", "20:35"],
    12: ["20:40", "21:25"],
};

function parseSwpuScheduleText(text: string): ParsedTextSchedule {
    const compact = text
        .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "")
        .replace(/\s+/g, "");

    const semesterTag = parseSwpuSemesterTag(text);
    const startDate = inferSwpuSemesterStart(semesterTag);
    const courses: TextScheduleCourse[] = [];
    const seen = new Set<string>();
    const entryPattern = /([A-Z0-9]{10})-([\s\S]*?)\[(\d{4})\]([0-9,\-周]+),星期([1-7]),第(\d{1,2})节-第(\d{1,2})节([\s\S]*?)(?=[A-Z0-9]{10}-|第\d{1,2}节-第\d{1,2}节|我的课程表|$)/g;

    for (const match of compact.matchAll(entryPattern)) {
        const code = match[1];
        const name = cleanSwpuCourseName(match[2]);
        const classCode = match[3];
        const weeksText = match[4].replace(/周/g, "");
        const dayOfWeek = Number(match[5]);
        const startPeriod = Number(match[6]);
        const endPeriod = Number(match[7]);
        const room = cleanSwpuRoom(match[8]);
        const start = SWPU_PERIOD_TIMES[startPeriod]?.[0];
        const end = SWPU_PERIOD_TIMES[endPeriod]?.[1];
        if (!name || !start || !end) continue;

        for (const [startWeek, endWeek] of parseWeeks(weeksText)) {
            const key = [code, name, classCode, dayOfWeek, start, end, startWeek, endWeek, room].join("|");
            if (seen.has(key)) continue;
            seen.add(key);
            courses.push({
                name: `${code} - ${name}`,
                teacher: "",
                room,
                dayOfWeek,
                startTime: start,
                endTime: end,
                startWeek,
                endWeek,
                note: `教学班 ${classCode}`,
                color: colorForCourse(`${code} - ${name}`),
            });
        }
    }

    if (courses.length === 0) throw new Error("没有识别到西南石油大学 PDF 课表中的课程");
    return {
        format: "loose",
        semesterTag,
        startDate,
        timezone: "Asia/Shanghai",
        maxWeeks: Math.max(...courses.map((course) => course.endWeek)),
        school: "西南石油大学",
        importMode: "replace",
        courses,
        warnings: [
            `已按西南石油大学节次时间表将第 1-12 节映射为具体时间；请在预览中核对 ${startDate} 是否为第 1 周周一。`,
        ],
    };
}

function parseSwpuSemesterTag(text: string): string {
    const match = text.match(/(\d{4})-(\d{4})学年\s*(春季|秋季|夏季)?学期/);
    if (!match) return inferDefaultSemesterTag();
    return `${match[1]}-${match[2]} ${match[3] || ""}学期`.trim();
}

function inferSwpuSemesterStart(semesterTag: string): string {
    const match = semesterTag.match(/(\d{4})-(\d{4})\s*(春季|秋季|夏季)?/);
    if (!match) return inferFirstMondayFromSemester(semesterTag);
    const year = match[3] === "春季" ? Number(match[2]) : Number(match[1]);
    const seed = match[3] === "春季" ? new Date(year, 1, 20) : new Date(year, 8, 1);
    while (seed.getDay() !== 1) seed.setDate(seed.getDate() + 1);
    return `${seed.getFullYear()}-${String(seed.getMonth() + 1).padStart(2, "0")}-${String(seed.getDate()).padStart(2, "0")}`;
}

function cleanSwpuCourseName(value: string): string {
    return value.replace(/[，,]+$/g, "").trim();
}

function cleanSwpuRoom(value: string): string {
    return value
        .replace(/[,，]+$/g, "")
        .replace(/第\d{1,2}节.*$/g, "")
        .replace(/我的课程表.*$/g, "")
        .trim();
}

function cellText(html: string): string {
    return decodeHtmlEntities(html.replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;/gi, "'");
}

function parseHtmlStartTime(value: string): string | null {
    const match = value.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*-/i);
    if (!match) return null;
    return normalizeClock(match[1], match[2] || "00", match[3], undefined);
}

function parseRowspan(attrs: string): number {
    const match = attrs.match(/\browspan\s*=\s*["']?(\d+)/i);
    const parsed = match ? Number(match[1]) : 1;
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 24 ? parsed : 1;
}

function addHours(time: string, hours: number): string {
    const [hourText, minute] = time.split(":");
    const hour = Number(hourText) + hours;
    return `${String(Math.min(hour, 23)).padStart(2, "0")}:${minute}`;
}

function parseFields(block: string): Map<string, string> {
    const fields = new Map<string, string>();
    for (const rawLine of block.split("\n")) {
        const line = rawLine.trim();
        if (!line || line === STRICT_HEADER) continue;
        const match = line.match(/^([^:\uFF1A]+)[:\uFF1A]\s*(.*)$/);
        if (!match) continue;
        fields.set(match[1].trim().toLowerCase().replace(/\s+/g, ""), match[2].trim());
    }
    return fields;
}

function requireField(fields: Map<string, string>, key: string, label: string): string {
    const value = fields.get(key)?.trim();
    if (!value) throw new Error(`${label} \u4e0d\u80fd\u4e3a\u7a7a`);
    return value;
}

function parseImportMode(value: string | undefined): TextScheduleImportMode {
    if (!value) return "replace";
    const normalized = value.trim().toLowerCase();
    if (normalized === "replace" || normalized === "append" || normalized === "new") return normalized;
    throw new Error("ImportMode \u53ea\u80fd\u662f replace\u3001append \u6216 new");
}

function parseDay(value: string): number {
    const day = parseDayOrNull(value);
    if (!day) throw new Error(`\u65e0\u6cd5\u8bc6\u522b\u5468\u6b21\uff1a${value}`);
    return day;
}

function parseDayOrNull(value: string): number | null {
    const normalized = value.trim().toLowerCase();
    return DAY_MAP[normalized] ?? null;
}

function parseCompactCourseLine(line: string): TextScheduleCourse[] | null {
    const parts = parseCompactCourseParts(line);
    if (!parts) return null;
    return parseWeeks(parts.tail.weeks).map(([startWeek, endWeek]) => ({
        name: parts.tail.name,
        teacher: "",
        room: parts.tail.room,
        dayOfWeek: parts.dayOfWeek,
        startTime: parts.startTime,
        endTime: parts.endTime,
        startWeek,
        endWeek,
        color: colorForCourse(parts.tail.name),
    }));
}

function parseCompactCourseParts(line: string): { dayOfWeek: number; startTime: string; endTime: string; tail: { name: string; room: string; weeks: string } } | null {
    const dayPattern = "(?:\\u5468[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u65e5\\u5929]|\\u661f\\u671f[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u65e5\\u5929]|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)";
    const timePattern = "(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?\\s*-\\s*\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?)";
    const match = line.match(new RegExp(`^(${dayPattern})\\s*${timePattern}\\s*(.+)$`, "i"));
    if (!match) return null;
    const dayOfWeek = parseDay(match[1]);
    const [startTime, endTime] = parseTimeRange(match[2]);
    const tail = parseCourseTail(match[3]);
    if (!tail) return null;
    return { dayOfWeek, startTime, endTime, tail };
}

function parseCourseTail(value: string): { name: string; room: string; weeks: string } | null {
    const normalized = value.trim();
    const weekSuffix = findWeekSuffix(normalized);
    if (!weekSuffix) return null;
    const beforeWeeks = normalized.slice(0, weekSuffix.index).trim();
    if (!beforeWeeks) return null;
    const roomMatch = beforeWeeks.match(/^(.*?)([A-Z]\d+[A-Z]*#[A-Z]?\d+|Lab#\d+|Room#\d+)$/i);
    const name = (roomMatch ? roomMatch[1] : beforeWeeks).trim();
    const room = (roomMatch ? roomMatch[2] : "").trim();
    if (!name) return null;
    return { name: name.replace(/\s+[\u2014-]\s+/g, " - "), room, weeks: weekSuffix.weeks };
}

function findWeekSuffix(value: string): { weeks: string; index: number } | null {
    for (let index = 0; index < value.length; index++) {
        const suffix = value.slice(index).trim().replace(/\s+/g, "").replace(/\u5468$/, "");
        if (!/^\d{1,2}-\d{1,2}(?:,\d{1,2}-\d{1,2})*$|^\d{1,2}$/.test(suffix)) continue;
        if (/^\d{1,2}$/.test(suffix) && /[\d-]$/.test(value.slice(0, index).trim())) continue;
        if (isPlausibleWeekList(suffix)) return { weeks: suffix, index };
    }
    return null;
}

function isPlausibleWeekList(value: string): boolean {
    for (const part of value.split(",")) {
        const [startText, endText = startText] = part.split("-");
        const start = Number(startText);
        const end = Number(endText);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > 30) return false;
    }
    return true;
}

function parseTimeRange(value: string): [string, string] {
    const match = value.trim().match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
    if (!match) throw new Error(`\u65e0\u6cd5\u8bc6\u522b\u65f6\u95f4\uff1a${value}`);
    const start = normalizeClock(match[1], match[2] || "00", match[3], match[6]);
    const end = normalizeClock(match[4], match[5] || "00", match[6], match[3]);
    if (start >= end) throw new Error(`\u7ed3\u675f\u65f6\u95f4\u5fc5\u987b\u665a\u4e8e\u5f00\u59cb\u65f6\u95f4\uff1a${value}`);
    return [start, end];
}

function normalizeClock(hourText: string, minuteText: string, marker: string | undefined, fallbackMarker: string | undefined): string {
    let hour = Number(hourText);
    const minute = Number(minuteText);
    const period = (marker || fallbackMarker || "").toLowerCase();
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("\u65f6\u95f4\u683c\u5f0f\u4e0d\u6b63\u786e");
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    if (hour < 0 || hour > 23) throw new Error("\u5c0f\u65f6\u5fc5\u987b\u5728 0-23 \u4e4b\u95f4");
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function looksLikeTimeRange(value: string): boolean {
    return /\d{1,2}(?:[:.]\d{2})?\s*(am|pm)?\s*-\s*\d{1,2}(?:[:.]\d{2})?\s*(am|pm)?/i.test(value);
}

function parseWeeks(value: string): [number, number][] {
    const normalized = value.trim().toLowerCase();
    const parity = /\bodd\b|\u5355\u5468/.test(normalized) ? "odd" : /\beven\b|\u53cc\u5468/.test(normalized) ? "even" : null;
    const body = normalized.replace(/\bodd\b|\beven\b|\u5355\u5468|\u53cc\u5468/g, "").trim();
    const ranges: [number, number][] = [];

    for (const part of body.split(",").map((item) => item.trim()).filter(Boolean)) {
        const rangeMatch = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!rangeMatch) throw new Error(`\u65e0\u6cd5\u8bc6\u522b\u5468\u6b21\uff1a${value}`);
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2] || rangeMatch[1]);
        if (start < 1 || end < start || end > MAX_SCHEDULE_WEEKS) {
            throw new Error(`周次必须在 1-${MAX_SCHEDULE_WEEKS} 之间：${value}`);
        }
        if (parity) {
            for (let week = start; week <= end; week++) {
                if ((parity === "odd" && week % 2 === 1) || (parity === "even" && week % 2 === 0)) ranges.push([week, week]);
            }
        } else {
            ranges.push([start, end]);
        }
    }
    if (ranges.length === 0) throw new Error(`\u65e0\u6cd5\u8bc6\u522b\u5468\u6b21\uff1a${value}`);
    return ranges;
}

function parsePositiveInt(value: string, label: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SCHEDULE_WEEKS) {
        throw new Error(`${label} 必须是 1-${MAX_SCHEDULE_WEEKS} 之间的整数`);
    }
    return parsed;
}

function validateIsoDate(value: string, label: string) {
    const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error(`${label} 必须是 YYYY-MM-DD 格式`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 2000 || year > 2100 || date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error(`${label} 不是有效日期`);
    }
}

function isMondayIsoDate(value: string): boolean {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 1;
}

function boundedText(value: unknown, label: string, maxLength: number, required: boolean): string {
    if (typeof value !== "string") throw new Error(`${label} 格式不正确`);
    const normalized = value.trim();
    if (required && !normalized) throw new Error(`${label} 不能为空`);
    if (normalized.length > maxLength) throw new Error(`${label} 不能超过 ${maxLength} 个字符`);
    return normalized;
}

function parseColor(value: string | undefined): string | null {
    if (!value) return null;
    if (!/^#[0-9a-f]{6}$/i.test(value.trim())) throw new Error(`Color \u5fc5\u987b\u662f #rrggbb \u683c\u5f0f\uff1a${value}`);
    return value.trim().toLowerCase();
}

function colorForCourse(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
}

function valueAfterColon(line: string): string {
    return line.replace(/^[^:\uFF1A]+[:\uFF1A]\s*/, "").trim();
}

function isMetadataLine(line: string): boolean {
    return /^[a-z]+\s*[:\uFF1A]|^[\u4e00-\u9fa5]+\s*[:\uFF1A]/i.test(line);
}

function inferFirstMondayFromSemester(semesterTag: string): string {
    const match = semesterTag.match(/(\d{4})\D+(\d{1,2})/);
    if (!match) throw new Error("\u7f3a\u5c11 StartDate\uff0c\u4e14\u65e0\u6cd5\u4ece Semester \u63a8\u65ad");
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < 2000 || year > 2100 || month < 1 || month > 12) throw new Error("Semester 中的年月不正确");
    const monthIndex = month - 1;
    const date = new Date(year, monthIndex, 1);
    while (date.getDay() !== 1) date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function inferDefaultSemesterTag(): string {
    const now = new Date();
    const month = now.getMonth() + 1;
    const semesterMonth = month >= 8 ? 9 : month >= 4 ? 4 : 1;
    return `${now.getFullYear()}/${String(semesterMonth).padStart(2, "0")}`;
}
