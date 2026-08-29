import { addDays, addWeeks, setHours, setMinutes } from "date-fns";
import type { BusyBlock, CalendarEvent, Course, MalaysiaHoliday, Schedule } from "@/lib/types";

type CalendarSchedule = Pick<Schedule, "id" | "semester_tag" | "start_date" | "max_weeks">;

const MAX_CALENDAR_WEEKS = 30;
const MAX_CALENDAR_COURSES = 500;
const MAX_CALENDAR_BUSY_BLOCKS = 1_000;
// PostgREST serializes PostgreSQL `time` values as HH:MM:SS, while imported
// parser values use HH:MM. Accept both representations, but keep the product's
// minute precision contract by rejecting non-zero seconds.
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::00(?:\.0{1,6})?)?$/;

export function expandCourses(courses: Course[], schedule: CalendarSchedule, userId: string, displayName: string, memberColor: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const week1Monday = parseLocalIsoDate(schedule.start_date);
    if (!week1Monday || week1Monday.getDay() !== 1 || !Number.isInteger(schedule.max_weeks)
        || schedule.max_weeks < 1 || schedule.max_weeks > MAX_CALENDAR_WEEKS) return events;

    for (const course of courses.slice(0, MAX_CALENDAR_COURSES)) {
        if (typeof course.name !== "string" || course.name.trim().length < 1 || course.name.length > 200
            || (course.room !== null && (typeof course.room !== "string" || course.room.length > 120))
            || (course.teacher !== null && (typeof course.teacher !== "string" || course.teacher.length > 120))
            || !Number.isInteger(course.day_of_week) || course.day_of_week < 1 || course.day_of_week > 7
            || !Number.isInteger(course.start_week) || !Number.isInteger(course.end_week)
            || course.start_week < 1 || course.end_week < course.start_week
            || !CLOCK_PATTERN.test(course.start_time) || !CLOCK_PATTERN.test(course.end_time)
            || course.end_time <= course.start_time) continue;
        const firstWeek = Math.max(1, course.start_week);
        const lastWeek = Math.min(course.end_week, schedule.max_weeks, MAX_CALENDAR_WEEKS);
        for (let week = firstWeek; week <= lastWeek; week++) {
            const courseDay = addDays(addWeeks(week1Monday, week - 1), course.day_of_week - 1);
            const start = applyTime(courseDay, course.start_time);
            const end = applyTime(courseDay, course.end_time);
            if (!start || !end || end <= start) continue;
            events.push({
                id: `${course.id}-w${week}`,
                title: `${displayName}: ${course.name}`,
                start,
                end,
                resource: { kind: "course", userId, displayName, color: memberColor, courseName: course.name, room: course.room, teacher: course.teacher },
            });
        }
    }
    return events;
}

export function expandBusyBlocks(blocks: BusyBlock[], userId: string, displayName: string, memberColor: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    for (const block of blocks.slice(0, MAX_CALENDAR_BUSY_BLOCKS)) {
        const start = new Date(block.starts_at);
        const end = new Date(block.ends_at);
        if (typeof block.title !== "string" || block.title.trim().length < 1 || block.title.length > 160
            || (block.note !== null && (typeof block.note !== "string" || block.note.length > 1_000))
            || !isBoundedDate(start) || !isBoundedDate(end) || end <= start
            || end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1000) continue;
        events.push({
            id: block.id,
            title: `${displayName}: ${block.title}`,
            start,
            end,
            resource: { kind: "busy", userId, displayName, color: memberColor, courseName: block.title, room: null, teacher: null, note: block.note },
        });
    }
    return events;
}

export function expandMalaysiaHolidays(holidays: MalaysiaHoliday[]): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    for (const holiday of holidays.slice(0, 1_000)) {
        const date = parseLocalIsoDate(holiday.date);
        if (!date) continue;
        const start = setMinutes(setHours(new Date(date), 7), 0);
        const end = setMinutes(setHours(new Date(date), 22), 0);
        events.push({
            id: holiday.id,
            title: holiday.localName || holiday.name,
            start,
            end,
            resource: { kind: "holiday", userId: "holiday-my", displayName: "MY", color: "#64748b", courseName: holiday.localName || holiday.name, room: null, teacher: null, note: holiday.name },
        });
    }
    return events;
}

function applyTime(date: Date, timeStr: string): Date | null {
    if (!CLOCK_PATTERN.test(timeStr)) return null;
    const [h, m] = timeStr.split(":").map(Number);
    const result = setMinutes(setHours(new Date(date), h), m);
    return isBoundedDate(result) ? result : null;
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
        if (!isBoundedDate(ev.start)) continue;
        const key = localDateKey(ev.start);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
    }
    return map;
}

export function getUsersOnDate(events: CalendarEvent[], date: Date): string[] {
    if (!isBoundedDate(date)) return [];
    const dateStr = localDateKey(date);
    const usersOnDate = new Set<string>();
    for (const ev of events) if (isBoundedDate(ev.start) && localDateKey(ev.start) === dateStr) usersOnDate.add(ev.resource.userId);
    return Array.from(usersOnDate);
}

function parseLocalIsoDate(value: string): Date | null {
    const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (year < 2000 || year > 2100 || date.getFullYear() !== year
        || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

function isBoundedDate(value: Date): boolean {
    return !Number.isNaN(value.getTime()) && value.getFullYear() >= 2000 && value.getFullYear() <= 2100;
}

function localDateKey(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
