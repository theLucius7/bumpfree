import assert from "node:assert/strict";
import { parseIcs, type IcsOptions } from "../lib/utils/ics";
const options: IcsOptions = {
  startDate: "2026-08-31",
  maxWeeks: 20,
  semesterTag: "Synthetic semester",
  school: "QA",
  timezone: "Asia/Shanghai",
  importMode: "replace",
};
const calendar = (events: string) =>
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BumpFree QA//EN\r\n" +
  events +
  "\r\nEND:VCALENDAR\r\n";
const event = (extra = "", id = "test") =>
  `BEGIN:VEVENT
UID:${id}
DTSTART;TZID=Asia/Shanghai:20260831T080000
DTEND;TZID=Asia/Shanghai:20260831T093500
SUMMARY:Algorithms
DESCRIPTION:Teacher: Test Teacher\\nSynthetic only
LOCATION:Test Room
${extra}
END:VEVENT`.replace(/\n/g, "\r\n");
const instances = (p: ReturnType<typeof parseIcs>) =>
  p.courses.reduce((n, c) => n + c.endWeek - c.startWeek + 1, 0);
let p = parseIcs(
  calendar(
    event(
      "RRULE:FREQ=WEEKLY;COUNT=8\nEXDATE;TZID=Asia/Shanghai:20260914T080000",
    ),
  ),
  options,
);
assert.equal(instances(p), 7);
assert.equal(p.courses[0].teacher, "Test Teacher");
assert.equal(p.courses[0].room, "Test Room");
assert.equal(p.courses[0].startTime, "08:00");
p = parseIcs(calendar(event("RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4")), options);
assert.equal(instances(p), 4);
assert.deepEqual(
  p.courses.map((c) => c.startWeek),
  [1, 3, 5, 7],
);
p = parseIcs(
  calendar(event("RDATE;TZID=Asia/Shanghai:20260907T080000")),
  options,
);
assert.equal(instances(p), 2);
p = parseIcs(
  calendar(
    event(
      "RRULE:FREQ=WEEKLY;COUNT=2\nRDATE;TZID=Asia/Shanghai:20260907T080000",
    ),
  ),
  options,
);
assert.equal(instances(p), 2);
p = parseIcs(
  calendar(
    event(
      "RDATE;VALUE=PERIOD;TZID=Asia/Shanghai:20260907T080000/20260907T100000",
    ),
  ),
  options,
);
assert.equal(instances(p), 2);
assert(p.courses.some((c) => c.endTime === "10:00"));
const changed = `BEGIN:VEVENT
UID:test
RECURRENCE-ID;TZID=Asia/Shanghai:20260907T080000
DTSTART;TZID=Asia/Shanghai:20260908T100000
DTEND;TZID=Asia/Shanghai:20260908T113500
SUMMARY:Moved
END:VEVENT`.replace(/\n/g, "\r\n");
p = parseIcs(
  calendar(
    event("RRULE:FREQ=WEEKLY;COUNT=2") +
      "\r\n" +
      event("RRULE:FREQ=WEEKLY;COUNT=2", "independent") +
      "\r\n" +
      changed,
  ),
  options,
);
assert.equal(instances(p), 4);
assert.equal(p.courses.filter((c) => c.name === "Moved").length, 1);
assert.throws(
  () =>
    parseIcs(
      calendar(event().replace("Asia/Shanghai", "Unknown/Zone")),
      options,
    ),
  /未知时区/,
);
assert.throws(
  () => parseIcs(calendar(event("RRULE:FREQ=SECONDLY;COUNT=999999")), options),
  /频率/,
);
assert.throws(
  () => parseIcs(calendar(event().replace("T093500", "T073500")), options),
  /时间/,
);
assert.throws(() => parseIcs("x".repeat(2 * 1024 * 1024 + 1), options), /2MiB/);
console.log(
  "PASS ICS: teachers/locations, timezone, odd weeks, EXDATE, RDATE/PERIOD, UID-scoped exceptions, malformed input",
);

const lines = (s: string) => s.trim().replace(/\n/g, "\r\n");
const customEvent = (body: string) =>
  lines(`BEGIN:VEVENT\n${body}\nEND:VEVENT`);
// Shanghai has a valid 02:30 while a New York host skips that wall-clock hour.
// Formatting must never construct an intermediate date in the host timezone.
for (const timing of [
  "DTSTART:20260307T183000Z\nDTEND:20260307T193000Z",
  "DTSTART;TZID=Asia/Shanghai:20260308T023000\nDTEND;TZID=Asia/Shanghai:20260308T033000",
]) {
  p = parseIcs(
    calendar(customEvent(`UID:host-gap\n${timing}\nSUMMARY:Host timezone gap`)),
    { ...options, startDate: "2026-03-02", maxWeeks: 2 },
  );
  assert.equal(p.courses.length, 1);
  assert.equal(p.courses[0].startTime, "02:30");
  assert.equal(p.courses[0].endTime, "03:30");
  assert.equal(p.courses[0].dayOfWeek, 7);
  assert.equal(p.courses[0].startWeek, 1);
}
p = parseIcs(
  calendar(
    customEvent(
      "UID:midnight\nDTSTART:20260307T160000Z\nDTEND:20260307T170000Z\nSUMMARY:Midnight",
    ),
  ),
  { ...options, startDate: "2026-03-02", maxWeeks: 2 },
);
assert.equal(p.courses[0].startTime, "00:00");
assert.equal(p.courses[0].endTime, "01:00");
assert.equal(p.courses[0].dayOfWeek, 7);
console.log("PASS ICS: host DST gap independence and midnight formatting");
const spring = { ...options, startDate: "2026-02-23", maxWeeks: 5 };
const autumn = { ...options, startDate: "2026-10-19", maxWeeks: 4 };
const nyMaster = customEvent(
  `UID:dst\nDTSTART;TZID=America/New_York:20260301T013000\nDTEND;TZID=America/New_York:20260301T033000\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Original`,
);
const utcException = customEvent(
  `UID:dst\nRECURRENCE-ID:20260308T063000Z\nDTSTART:20260308T063000Z\nDTEND:20260308T073000Z\nSUMMARY:Changed`,
);
p = parseIcs(calendar(nyMaster + "\r\n" + utcException), spring);
assert.equal(instances(p), 3);
assert(
  p.courses.some(
    (c) =>
      c.name === "Changed" && c.startTime === "14:30" && c.endTime === "15:30",
  ),
);
const zone = (id: string) =>
  lines(`BEGIN:VTIMEZONE
TZID:${id}
BEGIN:STANDARD
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE`);
for (const id of ["America/New_York", "Custom/NY"]) {
  const fall = customEvent(
    `UID:fold\nDTSTART;TZID=${id}:20261101T013000\nDTEND;TZID=${id}:20261101T023000\nSUMMARY:Fold`,
  );
  p = parseIcs(calendar(zone(id) + "\r\n" + fall), autumn);
  assert.equal(p.courses[0].startTime, "13:30");
  assert.equal(p.courses[0].endTime, "15:30");
  const exact = customEvent(
    `UID:fold\nRECURRENCE-ID:20261101T053000Z\nDTSTART:20261101T063000Z\nDTEND:20261101T073000Z\nSUMMARY:Second fold`,
  );
  p = parseIcs(calendar(zone(id) + "\r\n" + fall + "\r\n" + exact), autumn);
  assert.equal(instances(p), 1);
  assert.equal(p.courses[0].startTime, "14:30");
  assert.equal(p.courses[0].name, "Second fold");
  const cross = customEvent(
    `UID:spring\nDTSTART;TZID=${id}:20260308T013000\nDTEND;TZID=${id}:20260308T033000\nSUMMARY:Spring`,
  );
  p = parseIcs(calendar(zone(id) + "\r\n" + cross), spring);
  assert.equal(p.courses[0].startTime, "14:30");
  assert.equal(p.courses[0].endTime, "15:30");
  assert.throws(
    () =>
      parseIcs(
        calendar(zone(id) + "\r\n" + cross.replace("T013000", "T023000")),
        spring,
      ),
    /不存在时间/,
  );
}
const cancel = customEvent(
  `UID:test\nRECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Asia/Shanghai:20260907T080000\nSTATUS:CANCELLED`,
);
const once = customEvent(
  `UID:test\nRECURRENCE-ID;TZID=Asia/Shanghai:20260914T080000\nDTSTART;TZID=Asia/Shanghai:20260914T100000\nDTEND;TZID=Asia/Shanghai:20260914T110000\nSUMMARY:One exception`,
);
const resume = customEvent(
  `UID:test\nRECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Asia/Shanghai:20260928T080000\nDTSTART;TZID=Asia/Shanghai:20260928T090000\nDTEND;TZID=Asia/Shanghai:20260928T110000\nSUMMARY:Resumed`,
);
p = parseIcs(
  calendar(
    [event("RRULE:FREQ=WEEKLY;COUNT=6"), cancel, once, resume].join("\r\n"),
  ),
  options,
);
assert.equal(instances(p), 4);
assert.equal(
  p.courses
    .filter((c) => c.name === "Resumed")
    .reduce((n, c) => n + c.endWeek - c.startWeek + 1, 0),
  2,
);
assert(
  p.courses.some(
    (c) =>
      c.name === "Resumed" && c.startTime === "09:00" && c.endTime === "11:00",
  ),
);
p = parseIcs(
  calendar(
    event(
      "RDATE;VALUE=PERIOD;TZID=Asia/Shanghai:20260907T080000/PT2H\nRDATE;TZID=Asia/Shanghai:20260907T080000",
    ),
  ),
  options,
);
assert(p.courses.some((c) => c.startWeek === 2 && c.endTime === "10:00"));
assert.throws(
  () => parseIcs(calendar(once + "\r\n" + resume), options),
  /完整日历/,
);
assert.throws(
  () =>
    parseIcs(
      calendar(
        event(
          "RDATE;VALUE=PERIOD;TZID=Asia/Shanghai:20260907T080000/PT2H\nRDATE;VALUE=PERIOD;TZID=Asia/Shanghai:20260907T080000/PT3H",
        ),
      ),
      options,
    ),
  /时长冲突/,
);
console.log(
  "PASS ICS: DST folds/gaps, embedded VTIMEZONE, absolute UTC exceptions, range cancellation/resumption, PERIOD precedence",
);
