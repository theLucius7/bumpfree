// WakeUp API response parser
// API: https://i.wakeup.fun/share_schedule/get?key={key}
// Response is multiple JSON segments separated by newlines

export interface WakeUpTimeNode {
    node: number;
    startTime: string; // "HH:MM"
    endTime: string;
    timeTable: number;
}

export interface WakeUpCourse {
    id: number;
    courseName: string;
    color: string; // "#aarrggbb" format
}

export interface WakeUpCourseSlot {
    id: number; // references WakeUpCourse.id
    day: number; // 1=Mon, 2=Tue, ..., 7=Sun
    startNode: number;
    step: number; // number of nodes
    startWeek: number;
    endWeek: number;
    room: string;
    teacher: string;
    ownTime: boolean;
    startTime: string;
    endTime: string;
    tableId: number;
    level: number;
    type: number;
}

export interface WakeUpTableConfig {
    startDate: string; // "YYYY-M-D"
    maxWeek: number;
    school: string;
    tableName: string;
    showSat: boolean;
    showSun: boolean;
    sundayFirst: boolean;
}

export interface ParsedCourse {
    name: string;
    room: string;
    teacher: string;
    dayOfWeek: number; // 1=Mon, 7=Sun
    startTime: string; // "HH:MM"
    endTime: string;
    startWeek: number;
    endWeek: number;
    color: string; // hex color from WakeUp (converted from ARGB)
}

export interface ParsedSchedule {
    semesterTag: string;
    school: string;
    startDate: string; // ISO "YYYY-MM-DD"
    maxWeeks: number;
    courses: ParsedCourse[];
}

/**
 * Convert WakeUp ARGB hex (#aarrggbb) to CSS hex (#rrggbb)
 */
function argbToCssHex(argb: string): string {
    const cleaned = argb.replace(/^#/, "");
    if (/^[a-f0-9]{8}$/i.test(cleaned)) return `#${cleaned.slice(2).toLowerCase()}`;
    if (/^[a-f0-9]{6}$/i.test(cleaned)) return `#${cleaned.toLowerCase()}`;
    return "#2563eb";
}

/**
 * Parse the WakeUp share API response into structured schedule data.
 * The response body contains multiple JSON segments separated by "\n".
 */
export function parseWakeUpResponse(rawText: string): ParsedSchedule {
    if (typeof rawText !== "string" || rawText.length === 0 || rawText.length > 500_000) {
        throw new Error("WakeUp API 返回数据大小不合法");
    }
    // Split into non-empty lines and parse each as JSON
    const lines = rawText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    if (lines.length < 5) {
        throw new Error("WakeUp API \u8fd4\u56de\u6570\u636e\u683c\u5f0f\u9519\u8bef");
    }

    let timeNodes: unknown;
    let tableConfig: unknown;
    let courseList: unknown;
    let courseSlots: unknown;
    try {
        timeNodes = JSON.parse(lines[1]);
        tableConfig = JSON.parse(lines[2]);
        courseList = JSON.parse(lines[3]);
        courseSlots = JSON.parse(lines[4]);
    } catch {
        throw new Error("WakeUp API 返回数据不是有效 JSON");
    }

    if (!Array.isArray(timeNodes) || timeNodes.length === 0 || timeNodes.length > 100) {
        throw new Error("WakeUp 课节时间数据不合法");
    }
    if (!isRecord(tableConfig)) throw new Error("WakeUp 学期配置不合法");
    if (!Array.isArray(courseList) || courseList.length > 500) throw new Error("WakeUp 课程数量不合法");
    if (!Array.isArray(courseSlots) || courseSlots.length > 1_000) throw new Error("WakeUp 课程时段数量不合法");

    const maxWeeks = readInteger(tableConfig.maxWeek, 1, 30, "WakeUp 总周数不合法");
    const semesterTag = readText(tableConfig.tableName, 1, 80, "WakeUp 学期名称不合法");
    const school = readText(tableConfig.school ?? "", 0, 120, "WakeUp 学校名称不合法");
    const isoStartDate = normalizeDate(tableConfig.startDate);

    const validTimeNodes: WakeUpTimeNode[] = timeNodes.map((value) => {
        if (!isRecord(value)) throw new Error("WakeUp 课节时间数据不合法");
        const startTime = readTime(value.startTime);
        const endTime = readTime(value.endTime);
        if (timeToMinutes(endTime) <= timeToMinutes(startTime)) throw new Error("WakeUp 课节结束时间必须晚于开始时间");
        return {
            node: readInteger(value.node, 1, 100, "WakeUp 课节编号不合法"),
            startTime,
            endTime,
            timeTable: readInteger(value.timeTable, 0, 1_000_000, "WakeUp 时间表编号不合法"),
        };
    });

    const validCourses: WakeUpCourse[] = courseList.map((value) => {
        if (!isRecord(value)) throw new Error("WakeUp 课程数据不合法");
        return {
            id: readInteger(value.id, 0, 1_000_000_000, "WakeUp 课程编号不合法"),
            courseName: readText(value.courseName, 1, 120, "WakeUp 课程名称不合法"),
            color: typeof value.color === "string" ? value.color : "#2563eb",
        };
    });

    const validSlots: WakeUpCourseSlot[] = courseSlots.map((value) => {
        if (!isRecord(value)) throw new Error("WakeUp 课程时段数据不合法");
        const startWeek = readInteger(value.startWeek, 1, maxWeeks, "WakeUp 起始周不合法");
        const endWeek = readInteger(value.endWeek, startWeek, maxWeeks, "WakeUp 结束周不合法");
        return {
            id: readInteger(value.id, 0, 1_000_000_000, "WakeUp 课程编号不合法"),
            day: readInteger(value.day, 1, 7, "WakeUp 星期不合法"),
            startNode: readInteger(value.startNode, 1, 100, "WakeUp 起始课节不合法"),
            step: readInteger(value.step, 1, 20, "WakeUp 课节跨度不合法"),
            startWeek,
            endWeek,
            room: readText(value.room ?? "", 0, 120, "WakeUp 教室过长"),
            teacher: readText(value.teacher ?? "", 0, 120, "WakeUp 教师名称过长"),
            ownTime: value.ownTime === true,
            startTime: typeof value.startTime === "string" ? value.startTime : "",
            endTime: typeof value.endTime === "string" ? value.endTime : "",
            tableId: readInteger(value.tableId ?? 0, 0, 1_000_000_000, "WakeUp 时间表编号不合法"),
            level: readInteger(value.level ?? 0, 0, 1_000_000, "WakeUp 课程层级不合法"),
            type: readInteger(value.type ?? 0, 0, 1_000_000, "WakeUp 课程类型不合法"),
        };
    });

    const courseMap = new Map<number, WakeUpCourse>(
        validCourses.map((course) => [course.id, course])
    );

    // Build a map from node index to time
    const nodeTimeMap = new Map<number, { startTime: string; endTime: string }>(
        validTimeNodes.map((n) => [
            n.node,
            { startTime: n.startTime, endTime: n.endTime },
        ])
    );

    // Build ParsedCourse list
    const courses: ParsedCourse[] = [];

    for (const slot of validSlots) {
        // If ownTime, use slot's own startTime/endTime
        let startTime: string;
        let endTime: string;

        if (slot.ownTime && slot.startTime && slot.endTime) {
            startTime = readTime(slot.startTime);
            endTime = readTime(slot.endTime);
            if (timeToMinutes(endTime) <= timeToMinutes(startTime)) throw new Error("WakeUp 课程结束时间必须晚于开始时间");
        } else {
            // Resolve via node map
            const startNode = nodeTimeMap.get(slot.startNode);
            const endNode = nodeTimeMap.get(slot.startNode + slot.step - 1);
            if (!startNode || !endNode) continue;
            startTime = startNode.startTime;
            endTime = endNode.endTime;
        }

        const course = courseMap.get(slot.id);
        if (!course) continue;

        courses.push({
            name: course.courseName,
            room: slot.room || "",
            teacher: slot.teacher || "",
            dayOfWeek: slot.day, // 1=Mon, 7=Sun
            startTime,
            endTime,
            startWeek: slot.startWeek,
            endWeek: slot.endWeek,
            color: argbToCssHex(course.color),
        });
    }

    if (courses.length === 0) throw new Error("WakeUp 课表中没有可导入课程");

    return {
        semesterTag,
        school,
        startDate: isoStartDate,
        maxWeeks,
        courses,
    };
}

/**
 * Extract the hex key from a WakeUp share message.
 * Accepts either the full message or just the key itself.
 */
export function extractWakeUpKey(input: string): string | null {
    // Try to find the key in the share message (case-insensitive)
    const match = input.match(/分享口令为「([a-f0-9]{32})」/i);
    if (match) return match[1].toLowerCase();

    // If it's a direct 32-char hex key
    const trimmed = input.trim();
    if (/^[a-f0-9]{32}$/i.test(trimmed)) return trimmed.toLowerCase();

    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readInteger(value: unknown, minimum: number, maximum: number, message: string) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(message);
    }
    return value;
}

function readText(value: unknown, minimum: number, maximum: number, message: string) {
    if (typeof value !== "string") throw new Error(message);
    const text = value.trim();
    if (text.length < minimum || text.length > maximum) throw new Error(message);
    return text;
}

function readTime(value: unknown) {
    if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        throw new Error("WakeUp 课程时间不合法");
    }
    return value;
}

function timeToMinutes(value: string) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
}

function normalizeDate(value: unknown) {
    if (typeof value !== "string") throw new Error("WakeUp 开学日期不合法");
    const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) throw new Error("WakeUp 开学日期不合法");
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 2000 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error("WakeUp 开学日期不合法");
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
