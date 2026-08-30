import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";
import { extractScheduleFileText } from "../lib/utils/scheduleFiles";
import { parseTextSchedule } from "../lib/utils/textSchedule";
import { expandCourses } from "../lib/utils/calendar";

interface ParserExpectation {
  count: number;
  format: "strict" | "loose";
  firstName?: string;
  firstRoom?: string;
  firstDay?: number;
}

interface ParserSample {
  label: string;
  text: string;
  expect: ParserExpectation;
}

const parserSamples: ParserSample[] = [
  {
    label: "mobile compact pasted text",
    text: `Computer NetworksB2#3051-8
周三14:00-16:00Computer NetworksB2#30510-14
周五10:00-12:00Database SystemsLab#42-12`,
    expect: {
      count: 3,
      format: "loose",
      firstName: "Computer Networks",
      firstRoom: "B2#305",
      firstDay: 3,
    },
  },
  {
    label: "strict v1 with corrupted mobile separators",
    text: `BumpFree Schedule Import v1
Semester: 2026/04
StartDate: 2026-04-06
Timezone: Asia/Shanghai
MaxWeeks: 14
School: Manual Import
ImportMode: replace

飧?

Day: Monday
Time: 11:00-13:00
Name: SOF106 - Artificial Intelligence Principles
Teacher: Abdulrah Hakim Qaid Abdullah
Room: A5#G07
Weeks: 1-14

飧?

Day: Tuesday
Time: 09:00-10:00
Name: SOF106 - Artificial Intelligence Principles
Teacher: Abdulrah Hakim Qaid Abdullah
Room: B1#105
Weeks: 1-14`,
    expect: {
      count: 2,
      format: "strict",
      firstName: "SOF106 - Artificial Intelligence Principles",
      firstDay: 1,
    },
  },
  {
    label: "loose multiline chinese day",
    text: `Semester: 2026/04
StartDate: 2026-04-06
周一
10:00-12:00
Database Systems
Teacher: Dr Chen
Room: Lab#4
Weeks: 2-12`,
    expect: {
      count: 1,
      format: "loose",
      firstName: "Database Systems",
      firstRoom: "Lab#4",
      firstDay: 1,
    },
  },
  {
    label: "loose english day with 12-hour time",
    text: `Semester: 2026/04
Monday 8.00am-10.00am SOF106A5#G071-14`,
    expect: {
      count: 1,
      format: "loose",
      firstName: "SOF106",
      firstRoom: "A5#G07",
      firstDay: 1,
    },
  },
  {
    label: "strict odd weeks",
    text: `BumpFree Schedule Import v1
Semester: 2026/04
StartDate: 2026-04-06
MaxWeeks: 14

---
Day: Friday
Time: 08:00-09:00
Name: Lab Rotation
Teacher:
Room: A1#101
Weeks: odd 1-5`,
    expect: {
      count: 3,
      format: "strict",
      firstName: "Lab Rotation",
      firstDay: 5,
    },
  },
  {
    label: "minimal xmu html",
    text: `<!doctype html><table><thead><tr><th>Time</th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th><th>Saturday</th><th>Sunday</th></tr></thead><tbody>
<tr><td>8.00am-9.00am</td><td>&nbsp;</td><td class="row_kb" rowspan="2">SOF106<br />Principles of Artificial Intelligence<br />Abdulrab Hakim<br />B1#105<br />(Week 1-14)</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
<tr><td>9.00am-10.00am</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
<tr><td>10.00am-11.00am</td><td>MAT101<br />Math<br />Teacher<br />A1#101<br />(Week 2-4)</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</tbody></table>`,
    expect: {
      count: 2,
      format: "loose",
      firstName: "SOF106 - Principles of Artificial Intelligence",
      firstRoom: "B1#105",
      firstDay: 2,
    },
  },
];

for (const sample of parserSamples) {
  const parsed = parseTextSchedule(sample.text);
  assert.equal(
    parsed.courses.length,
    sample.expect.count,
    `${sample.label}: course count`,
  );
  assert.equal(parsed.format, sample.expect.format, `${sample.label}: format`);
  if (sample.expect.firstName)
    assert.equal(
      parsed.courses[0]?.name,
      sample.expect.firstName,
      `${sample.label}: first course name`,
    );
  if (sample.expect.firstRoom)
    assert.equal(
      parsed.courses[0]?.room,
      sample.expect.firstRoom,
      `${sample.label}: first room`,
    );
  if (sample.expect.firstDay)
    assert.equal(
      parsed.courses[0]?.dayOfWeek,
      sample.expect.firstDay,
      `${sample.label}: first day`,
    );
  console.log(`PASS ${sample.label}: ${parsed.courses.length} courses`);
}

const rejectedSamples = [
  { label: "empty input", text: "", message: "请先粘贴课表文本" },
  {
    label: "invalid time order",
    text: "周一14:00-12:00Bad CourseA1#1011-2",
    message: "结束时间必须晚于开始时间",
  },
  {
    label: "invalid weeks",
    text: "周一10:00-12:00Bad CourseA1#10114-2",
    message: "没有识别到可导入课程",
  },
];

for (const sample of rejectedSamples) {
  assert.throws(
    () => parseTextSchedule(sample.text),
    (error: unknown) =>
      error instanceof Error && error.message.includes(sample.message),
    `${sample.label}: expected error containing ${JSON.stringify(sample.message)}`,
  );
  console.log(`PASS ${sample.label}: rejected`);
}

assert.throws(
  () =>
    parseTextSchedule("周一10:00-12:00CourseA1#1011-2", {
      adapterKey: "unknown",
    }),
  /学校专用导入接口请通过 scheduleAdapterRegistry 调用/,
  "unknown adapter keys must be rejected",
);
console.log("PASS unknown adapter key: rejected");

const strictCourse = (
  startDate: string,
  maxWeeks: number,
  weeks: string,
) => `BumpFree Schedule Import v1
Semester: validation
StartDate: ${startDate}
Timezone: Asia/Shanghai
MaxWeeks: ${maxWeeks}
School: Test
ImportMode: replace

---
Day: Monday
Time: 10:00-11:00
Name: Validation Course
Teacher:
Room:
Weeks: ${weeks}`;

assert.throws(
  () => parseTextSchedule(strictCourse("2026-02-30", 14, "1-14")),
  /不是有效日期/,
);
assert.throws(
  () => parseTextSchedule(strictCourse("2026-04-07", 14, "1-14")),
  /周一/,
);
assert.throws(
  () => parseTextSchedule(strictCourse("2026-04-06", 31, "1-31")),
  /1-30/,
);
assert.throws(() => parseTextSchedule("x".repeat(100_001)), /100000|100,000/);
console.log("PASS schedule date, week and input-size bounds");

const databaseClockEvents = expandCourses(
  [
    {
      id: "00000000-0000-4000-8000-000000000001",
      schedule_id: "00000000-0000-4000-8000-000000000002",
      user_id: "00000000-0000-4000-8000-000000000003",
      name: "Database Clock Course",
      room: null,
      teacher: null,
      day_of_week: 1,
      start_time: "09:00:00",
      end_time: "10:30:00",
      start_week: 1,
      end_week: 1,
      color: "#2563eb",
      created_at: "2026-04-01T00:00:00Z",
    },
  ],
  {
    id: "00000000-0000-4000-8000-000000000002",
    semester_tag: "database-clock",
    start_date: "2026-04-06",
    max_weeks: 1,
  },
  "00000000-0000-4000-8000-000000000003",
  "Test User",
  "#2563eb",
);
assert.equal(
  databaseClockEvents.length,
  1,
  "Legacy HH:MM:SS clock values must render",
);
assert.equal(databaseClockEvents[0]?.start.getHours(), 9);
assert.equal(databaseClockEvents[0]?.end.getMinutes(), 30);
console.log("PASS calendar clock normalization");

async function testScheduleFileExtraction() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Day", "Course"],
      ["Monday", "Algorithms"],
    ]),
    "Schedule",
  );
  const workbookBytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  });
  const workbookText = await extractScheduleFileText(
    new File([workbookBytes], "schedule.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  assert.match(workbookText, /# Sheet: Schedule/);
  assert.match(workbookText, /Monday\tAlgorithms/);
  await assert.rejects(
    () =>
      extractScheduleFileText(
        new File(["not a workbook"], "fake.xlsx", {
          type: "application/vnd.ms-excel",
        }),
      ),
    /有效的 Excel/,
  );
  const forgedZip = createForgedSmallZip(20 * 1024 * 1024 + 1);
  await assert.rejects(
    () =>
      extractScheduleFileText(
        new File([Uint8Array.from(forgedZip)], "forged.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ),
    /解压后过大/,
  );
  console.log(
    "PASS bounded XLSX extraction, signatures and forged ZIP-size rejection",
  );
}

function createForgedSmallZip(actualUncompressedSize: number): Buffer {
  const fileName = Buffer.from("word/document.xml", "utf8");
  const compressed = deflateRawSync(
    Buffer.alloc(actualUncompressedSize, 0x41),
    { level: 9 },
  );
  const forgedSize = 1;

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(forgedSize, 22);
  localHeader.writeUInt16LE(fileName.length, 26);

  const localEntry = Buffer.concat([localHeader, fileName, compressed]);
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(forgedSize, 24);
  centralHeader.writeUInt16LE(fileName.length, 28);
  const centralEntry = Buffer.concat([centralHeader, fileName]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralEntry.length, 12);
  eocd.writeUInt32LE(localEntry.length, 16);
  return Buffer.concat([localEntry, centralEntry, eocd]);
}

testScheduleFileExtraction().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
