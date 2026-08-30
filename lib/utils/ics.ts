import ICAL from "ical.js";
import { fromZonedTime } from "date-fns-tz";
import { MEMBER_COLORS } from "./colors";
import {
  validateParsedTextSchedule,
  type ParsedTextSchedule,
  type TextScheduleCourse,
} from "./textSchedule";
export interface IcsOptions {
  startDate: string;
  maxWeeks: number;
  semesterTag: string;
  school: string;
  timezone: string;
  importMode: "replace" | "new";
}
type Time = InstanceType<typeof ICAL.Time>;
type Component = InstanceType<typeof ICAL.Component>;
type Candidate = { time: Time; periodSeconds?: number };
const MAX_BYTES = 2 * 1024 * 1024,
  MAX_CANDIDATES = 20000,
  MAX_INSTANCES = 5000;
const wall = (t: Time) =>
  t.year +
  "-" +
  String(t.month).padStart(2, "0") +
  "-" +
  String(t.day).padStart(2, "0") +
  "T" +
  String(t.hour).padStart(2, "0") +
  ":" +
  String(t.minute).padStart(2, "0") +
  ":" +
  String(t.second).padStart(2, "0");
const timeFormatters = new Map<string, Intl.DateTimeFormat>();
function zonedWall(date: Date, timeZone: string): string {
  let formatter = timeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    timeFormatters.set(timeZone, formatter);
  }
  // Do not create a host-local Date: its DST gap can corrupt another zone's
  // valid wall-clock time. Explicit Intl parts also keep midnight at 00:00.
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
class IntlTimezone extends ICAL.Timezone {
  override utcOffset(time: Time) {
    const local = wall(time),
      nominal = Date.parse(local + "Z"),
      matches: number[] = [];
    for (const hours of [-36, 0, 36]) {
      const sample = nominal + hours * 3600000;
      const sampleWall = zonedWall(new Date(sample), this.tzid);
      const offset = Date.parse(sampleWall + "Z") - sample;
      const instant = nominal - offset;
      if (zonedWall(new Date(instant), this.tzid) === local)
        matches.push(instant);
    }
    if (!matches.length)
      throw new Error(
        "日程处于夏令时跳过的不存在时间：" + local + " " + this.tzid,
      );
    return (nominal - Math.min(...matches)) / 1000;
  }
}
type Transition = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  prevUtcOffset: number;
  utcOffset: number;
};
class SuppliedTimezone extends ICAL.Timezone {
  override utcOffset(time: Time) {
    const offset = super.utcOffset(time),
      local = Date.parse(wall(time) + "Z");
    // Adapter for ical.js 2.2.1's transition shape: pinned and regression-tested.
    // The upstream fold policy chooses standard time, not the first occurrence.
    for (const change of this.changes as Transition[]) {
      const utc = Date.UTC(
        change.year,
        change.month - 1,
        change.day,
        change.hour,
        change.minute,
        change.second,
      );
      const before = utc + change.prevUtcOffset * 1000,
        after = utc + change.utcOffset * 1000;
      if (local >= Math.min(before, after) && local < Math.max(before, after)) {
        if (after > before)
          throw new Error(
            "日程处于夏令时跳过的不存在时间：" + wall(time) + " " + this.tzid,
          );
        return change.prevUtcOffset;
      }
    }
    return offset;
  }
}
function knownTimezone(id: string) {
  const current = ICAL.TimezoneService.get(id);
  if (current) return current;
  try {
    new Intl.DateTimeFormat("en", { timeZone: id });
  } catch {
    throw new Error("未知时区 " + id + "；请在ICS中提供VTIMEZONE");
  }
  const zone = new IntlTimezone({ tzid: id });
  ICAL.TimezoneService.register(zone);
  return zone;
}
const propertyText = (c: Component, name: string) =>
  String(c.getFirstPropertyValue(name) || "");
function status(c: Component) {
  return propertyText(c, "status").toUpperCase();
}
function revision(c: Component) {
  return [
    Number(c.getFirstPropertyValue("sequence") || 0),
    propertyText(c, "last-modified") || propertyText(c, "dtstamp"),
  ] as const;
}
function latest(items: Component[]) {
  return [...items].sort(
    (a, b) =>
      revision(b)[0] - revision(a)[0] ||
      revision(b)[1].localeCompare(revision(a)[1]),
  )[0];
}
export function parseIcs(
  text: string,
  options: IcsOptions,
): ParsedTextSchedule {
  ICAL.TimezoneService.reset();
  timeFormatters.clear();
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Error("ICS文件不能超过2MiB");
  if (text.includes("\0")) throw new Error("ICS含无效二进制数据");
  let depth = 0,
    components = 0;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (line.length > 128000) throw new Error("ICS单行过长");
    if (/^BEGIN:/i.test(line)) {
      depth++;
      components++;
    }
    if (/^END:/i.test(line)) depth--;
    if (depth < 0 || depth > 16 || components > 2200)
      throw new Error("ICS组件过多或嵌套不合法");
  }
  if (depth !== 0) throw new Error("ICS组件未正确闭合");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(options.startDate) ||
    new Date(options.startDate + "T00:00:00Z").getUTCDay() !== 1 ||
    !Number.isInteger(options.maxWeeks) ||
    options.maxWeeks < 1 ||
    options.maxWeeks > 30
  )
    throw new Error("请选择第1周周一和1–30周的范围");
  try {
    new Intl.DateTimeFormat("en", { timeZone: options.timezone });
  } catch {
    throw new Error("输出时区必须是有效的IANA时区");
  }
  const root = new ICAL.Component(ICAL.parse(text.replace(/^\uFEFF/, "")));
  if (root.name !== "vcalendar")
    throw new Error("请选择有效的VCALENDAR日历文件");
  const suppliedIds = new Set<string>();
  for (const c of root.getAllSubcomponents("vtimezone")) {
    const id = propertyText(c, "tzid"),
      rules = c.getAllSubcomponents();
    if (
      !id ||
      ["UTC", "Z", "floating"].includes(id) ||
      suppliedIds.has(id) ||
      !rules.length ||
      rules.some(
        (r) =>
          !["standard", "daylight"].includes(r.name) ||
          !r.hasProperty("dtstart") ||
          !r.hasProperty("tzoffsetfrom") ||
          !r.hasProperty("tzoffsetto"),
      )
    )
      throw new Error("VTIMEZONE定义缺失、重复或无效");
    suppliedIds.add(id);
    ICAL.TimezoneService.register(new SuppliedTimezone(c));
  }
  const floatingZone = propertyText(root, "x-wr-timezone") || options.timezone;
  const fallback = knownTimezone(floatingZone);
  const list = root.getAllSubcomponents("vevent");
  if (!list.length || list.length > 2000)
    throw new Error("ICS需要包含1–2000条VEVENT");
  const groups = new Map<string, Component[]>(),
    warnings = new Set<string>();
  for (const c of list) {
    const uid = propertyText(c, "uid");
    if (!uid || uid.length > 512) throw new Error("每个日程必须有有效UID");
    if (c.hasProperty("dtend") && c.hasProperty("duration"))
      throw new Error("日程同时含DTEND和DURATION");
    if (c.hasProperty("exrule"))
      throw new Error("暂不支持EXRULE，请先转换为EXDATE");
    const range = c.getFirstProperty("recurrence-id")?.getParameter("range");
    if (range && range !== "THISANDFUTURE")
      throw new Error("仅支持RANGE=THISANDFUTURE");
    for (const key of [
      "dtstart",
      "dtend",
      "recurrence-id",
      "rdate",
      "exdate",
    ]) {
      for (const p of c.getAllProperties(key)) {
        const tzid = p.getParameter("tzid");
        if (typeof tzid === "string") knownTimezone(tzid);
        for (const v of p.getValues()) {
          const times =
            v instanceof ICAL.Period ? [v.start, v.end].filter(Boolean) : [v];
          // Replace zones hydrated through the parent component's private cache too.
          for (const value of times)
            if (value instanceof ICAL.Time && !value.isDate)
              value.zone =
                value.zone.tzid === "floating"
                  ? fallback
                  : knownTimezone(value.zone.tzid);
        }
      }
    }
    groups.set(uid, [...(groups.get(uid) || []), c]);
  }
  const start = fromZonedTime(
    options.startDate + "T00:00:00",
    options.timezone,
  ).getTime();
  const endDate = new Date(
    Date.parse(options.startDate + "T00:00:00Z") +
      options.maxWeeks * 7 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const end = fromZonedTime(endDate + "T00:00:00", options.timezone).getTime();
  const rows = new Map<
    string,
    { course: TextScheduleCourse; weeks: Set<number> }
  >();
  let iterations = 0,
    instances = 0;
  const timeKey = (t: Time) =>
    t.isDate ? t.toString() : String(t.toUnixTime());
  for (const [uid, components] of groups) {
    const masters = components.filter((c) => !c.hasProperty("recurrence-id"));
    if (!masters.length && components.length > 1)
      throw new Error(
        "ICS仅包含同一课程的部分调课记录，请导出含原始课程的完整日历",
      );
    const master = latest(masters.length ? masters : components);
    if (status(master) === "CANCELLED") continue;
    if (!master.hasProperty("dtstart")) throw new Error("日程缺少DTSTART");
    const exceptions = masters.length
      ? components.filter((c) => c.hasProperty("recurrence-id"))
      : [];
    const byRid = new Map<string, Component[]>();
    for (const c of exceptions) {
      const t = c.getFirstPropertyValue("recurrence-id");
      if (!(t instanceof ICAL.Time) || t.isDate)
        throw new Error("RECURRENCE-ID无效");
      const k = timeKey(t);
      byRid.set(k, [...(byRid.get(k) || []), c]);
    }
    const uniqueExceptions = [...byRid.values()].map(latest);
    const rangeStates = uniqueExceptions
      .filter(
        (c) =>
          c.getFirstProperty("recurrence-id")?.getParameter("range") ===
          "THISANDFUTURE",
      )
      .sort(
        (a, b) =>
          (a.getFirstPropertyValue("recurrence-id") as Time).toUnixTime() -
          (b.getFirstPropertyValue("recurrence-id") as Time).toUnixTime(),
      );
    const event = new ICAL.Event(master);
    const baseStart = event.startDate;
    for (const range of rangeStates) {
      if (status(range) === "CANCELLED") continue;
      const rid = range.getFirstPropertyValue("recurrence-id"),
        dt = range.getFirstPropertyValue("dtstart");
      if (
        !(rid instanceof ICAL.Time) ||
        !(dt instanceof ICAL.Time) ||
        rid.zone.tzid !== baseStart.zone.tzid ||
        dt.zone.tzid !== baseStart.zone.tzid
      )
        throw new Error(
          "跨时区的THISANDFUTURE调课暂不支持，请统一导出为UTC或展开成独立日程",
        );
    }
    if (event.startDate.isDate) {
      if (propertyText(master, "transp").toUpperCase() === "TRANSPARENT") {
        warnings.add(
          "已跳过不占用时间的全天提醒（例如待安排实验），未将其变成课程。",
        );
        continue;
      }
      throw new Error("课表暂不支持占用全天的日程：" + (event.summary || uid));
    }
    const candidates = new Map<string, Candidate>();
    const add = (t: Time, periodSeconds?: number) => {
      const key = timeKey(t),
        previous = candidates.get(key);
      if (
        periodSeconds !== undefined &&
        previous?.periodSeconds !== undefined &&
        previous.periodSeconds !== periodSeconds
      )
        throw new Error("相同时间的RDATE PERIOD时长冲突");
      candidates.set(key, {
        time: previous?.time || t,
        periodSeconds: periodSeconds ?? previous?.periodSeconds,
      });
    };
    add(event.startDate.clone());
    let maxShift = 0;
    for (const c of uniqueExceptions) {
      const rid = c.getFirstPropertyValue("recurrence-id"),
        dt = c.getFirstPropertyValue("dtstart");
      if (status(c) !== "CANCELLED" && !(dt instanceof ICAL.Time))
        throw new Error("调课记录缺少DTSTART");
      if (rid instanceof ICAL.Time && dt instanceof ICAL.Time) {
        maxShift = Math.max(
          maxShift,
          Math.abs(dt.toUnixTime() - rid.toUnixTime()) * 1000,
        );
        add(rid.clone()); // Include detached instances moved into this import window.
      }
    }
    if (maxShift > 366 * 86400000)
      throw new Error("调课偏移超过一年，请缩小ICS范围");
    for (const p of master.getAllProperties("rrule")) {
      const rule = p.getFirstValue();
      if (!(rule instanceof ICAL.Recur)) throw new Error("RRULE无效");
      if (
        !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rule.freq) ||
        !Number.isInteger(rule.interval) ||
        rule.interval < 1 ||
        rule.interval > 1000 ||
        (rule.count !== null &&
          rule.count !== undefined &&
          (!Number.isInteger(rule.count) || rule.count < 1))
      )
        throw new Error("重复规则频率或次数不受支持");
      const iterator = rule.iterator(event.startDate);
      for (;;) {
        if (++iterations > MAX_CANDIDATES)
          throw new Error("重复规则过于复杂，请导出较短日期范围");
        const t = iterator.next();
        if (!t) break;
        if (t.toUnixTime() * 1000 >= end + maxShift + 86400000) break;
        add(t.clone());
      }
    }
    for (const p of master.getAllProperties("rdate"))
      for (const v of p.getValues()) {
        if (v instanceof ICAL.Time) add(v.clone());
        else if (v instanceof ICAL.Period) {
          if (v.duration?.days || v.duration?.weeks)
            throw new Error("课表不支持按日历天计长的DURATION");
          add(
            v.start.clone(),
            v.end
              ? v.end.toUnixTime() - v.start.toUnixTime()
              : v.getDuration().toSeconds(),
          );
        } else throw new Error("RDATE格式无效");
      }
    const excluded = new Set<string>();
    for (const p of master.getAllProperties("exdate"))
      for (const v of p.getValues()) {
        if (!(v instanceof ICAL.Time)) throw new Error("EXDATE格式无效");
        excluded.add(timeKey(v));
      }
    for (const [k, candidate] of candidates) {
      if (excluded.has(k)) continue;
      const exactList = byRid.get(k),
        exact = exactList ? latest(exactList) : undefined;
      const range = rangeStates
        .filter(
          (c) =>
            (c.getFirstPropertyValue("recurrence-id") as Time).toUnixTime() <=
            candidate.time.toUnixTime(),
        )
        .at(-1);
      const component = exact || range || master;
      if (status(component) === "CANCELLED") continue;
      const field = (name: string) =>
        propertyText(component.hasProperty(name) ? component : master, name);
      if (field("transp").toUpperCase() === "TRANSPARENT") {
        warnings.add("已跳过标记为TRANSPARENT（不占用时间）的日程。");
        continue;
      }
      // Exact exceptions match absolute RECURRENCE-ID and preserve their original
      // UTC/TZID times. UTC-to-local conversion would lose the second DST fold.
      const item = component === master ? event : new ICAL.Event(component);
      const actualStart = exact ? item.startDate : candidate.time.clone();
      if (!exact && range) {
        if (actualStart.zone.tzid !== baseStart.zone.tzid)
          throw new Error(
            "THISANDFUTURE与RDATE时区不同，请统一导出为UTC或展开成独立日程",
          );
        const rid = range.getFirstPropertyValue("recurrence-id") as Time;
        const delta =
          (Date.parse(wall(item.startDate) + "Z") -
            Date.parse(wall(rid) + "Z")) /
          1000;
        actualStart.addDuration(ICAL.Duration.fromSeconds(delta));
      }
      const begins = actualStart.toJSDate();
      let finishes: Date;
      const duration = component.getFirstPropertyValue("duration");
      if (
        duration instanceof ICAL.Duration &&
        (duration.days || duration.weeks)
      )
        throw new Error("课表不支持按日历天计长的DURATION");
      if (candidate.periodSeconds !== undefined && component === master)
        finishes = new Date(begins.getTime() + candidate.periodSeconds * 1000);
      else if (component.hasProperty("dtend")) {
        if (item.endDate.isDate !== item.startDate.isDate)
          throw new Error("DTSTART和DTEND日期类型不一致");
        finishes = new Date(
          begins.getTime() +
            (item.endDate.toUnixTime() - item.startDate.toUnixTime()) * 1000,
        );
      } else if (duration instanceof ICAL.Duration)
        finishes = new Date(begins.getTime() + duration.toSeconds() * 1000);
      else throw new Error("定时课程需要DTEND或DURATION");
      if (begins.getTime() < start || begins.getTime() >= end) continue;
      if (++instances > MAX_INSTANCES)
        throw new Error("课表实例超过5000条，请缩小导入范围");
      if (
        actualStart.isDate ||
        actualStart.second ||
        !Number.isFinite(finishes.getTime()) ||
        finishes.getUTCSeconds() ||
        finishes.getUTCMilliseconds() ||
        finishes <= begins
      )
        throw new Error("日程需包含分钟精度的有效开始和结束时间");
      const startWall = zonedWall(begins, options.timezone),
        endWall = zonedWall(finishes, options.timezone),
        day = startWall.slice(0, 10),
        endDay = endWall.slice(0, 10);
      if (day !== endDay)
        throw new Error("暂不支持跨午夜课程：" + (field("summary") || uid));
      const name = field("summary") || "未命名课程";
      const description = field("description");
      const teacher =
        field("x-teacher") ||
        description
          .match(
            /(?:^|\n)\s*(?:任课老师|任课教师|教师|老师|Teacher|Instructor)\s*[:：]\s*([^\n]+)/i,
          )?.[1]
          ?.trim() ||
        "";
      const room = field("location");
      const offset = Math.floor(
        (Date.parse(day + "T00:00:00Z") -
          Date.parse(options.startDate + "T00:00:00Z")) /
          86400000,
      );
      const week = Math.floor(offset / 7) + 1,
        dayOfWeek = (offset % 7) + 1;
      const course: TextScheduleCourse = {
        name,
        teacher,
        room,
        dayOfWeek,
        startTime: startWall.slice(11, 16),
        endTime: endWall.slice(11, 16),
        startWeek: week,
        endWeek: week,
        color: MEMBER_COLORS[rows.size % MEMBER_COLORS.length],
        note: description.slice(0, 500),
      };
      const key = JSON.stringify([
        uid,
        name,
        teacher,
        room,
        dayOfWeek,
        course.startTime,
        course.endTime,
        course.note,
      ]);
      const row = rows.get(key);
      if (row) row.weeks.add(week);
      else rows.set(key, { course, weeks: new Set([week]) });
    }
  }
  const courses: TextScheduleCourse[] = [];
  for (const { course, weeks } of rows.values()) {
    const sorted = [...weeks].sort((a, b) => a - b);
    let from = sorted[0],
      last = from;
    for (const week of sorted.slice(1)) {
      if (week === last + 1) last = week;
      else {
        courses.push({ ...course, startWeek: from, endWeek: last });
        from = last = week;
      }
    }
    courses.push({ ...course, startWeek: from, endWeek: last });
  }
  if (!courses.length)
    throw new Error("所选日期范围内没有可导入的定时课程，请检查学期起点");
  warnings.add(
    "已按实际日期保留重复规则及例外；同名课表默认整体覆盖，重复导入不会增加副本。",
  );
  return validateParsedTextSchedule({
    format: "strict",
    ...options,
    courses,
    warnings: [...warnings],
  });
}
