"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ParsedTextSchedule } from "@/lib/utils/textSchedule";
import { importIcsSchedule } from "@/lib/actions/courses";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
export function IcsImportPanel({
  canCreateSchedule,
}: {
  canCreateSchedule: boolean;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<ParsedTextSchedule | null>(null),
    [error, setError] = useState("");
  const [parsing, setParsing] = useState(false),
    [pending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState("2026-08-31"),
    [weeks, setWeeks] = useState(20),
    [name, setName] = useState("2026-2027 秋季学期"),
    [school, setSchool] = useState("西南石油大学");
  const [mode, setMode] = useState<"replace" | "new">("replace");
  const worker = useRef<Worker | null>(null),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null),
    generation = useRef(0);
  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  };
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  function invalidate() {
    generation.current++;
    stop();
    setParsing(false);
    setPreview(null);
    setError("");
  }
  async function parse() {
    if (!file) return;
    invalidate();
    const current = generation.current;
    setParsing(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("ICS文件不能超过2MiB");
      if (!file.name.toLowerCase().endsWith(".ics"))
        throw new Error("请选择.ics日历文件");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (current !== generation.current) return;
      const task = new Worker("/ics-worker.js", { type: "module" });
      worker.current = task;
      const fail = (message: string) => {
        if (current !== generation.current) return;
        stop();
        setParsing(false);
        setError(message);
      };
      timeout.current = setTimeout(
        () => fail("文件解析超时，请导出更短的日期范围"),
        5000,
      );
      task.onmessage = (
        event: MessageEvent<{ data?: ParsedTextSchedule; error?: string }>,
      ) => {
        if (current !== generation.current) return;
        stop();
        setParsing(false);
        if (event.data.error) setError(event.data.error);
        else setPreview(event.data.data || null);
      };
      task.onerror = () => fail("解析器加载失败，请刷新后重试");
      task.postMessage({
        text,
        options: {
          startDate,
          maxWeeks: weeks,
          semesterTag: name,
          school,
          timezone: "Asia/Shanghai",
          importMode: mode,
        },
      });
    } catch (error) {
      if (current !== generation.current) return;
      stop();
      setParsing(false);
      setError(error instanceof Error ? error.message : "文件读取失败");
    }
  }
  function save() {
    if (!preview) return;
    if (
      mode === "replace" &&
      !window.confirm(
        "将覆盖同名学期的现有课程（如有）。确认已核对预览并继续？",
      )
    )
      return;
    startTransition(async () => {
      const result = await importIcsSchedule(preview);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
      } else {
        toast.success("已导入 " + result.courseCount + " 条课程记录");
        setPreview(null);
      }
    });
  }
  const locked = parsing || pending;
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <CalendarDays className="w-5 h-5" />
          导入 ICS 日历
        </CardTitle>
        <CardDescription>
          直接读取课程名称、时间、老师和地点。文件在浏览器解析，确认后才保存课程数据；不会保存原始文件。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="ics-file">日历文件（.ics，最多2MiB）</Label>
            <Input
              id="ics-file"
              type="file"
              accept=".ics,text/calendar"
              disabled={pending}
              onChange={(e) => {
                invalidate();
                setFile(e.target.files?.[0] || null);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ics-name">课表名称</Label>
            <Input
              id="ics-name"
              value={name}
              maxLength={80}
              disabled={pending}
              onChange={(e) => {
                invalidate();
                setName(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ics-start">第1周周一</Label>
            <Input
              id="ics-start"
              type="date"
              value={startDate}
              disabled={pending}
              onChange={(e) => {
                invalidate();
                setStartDate(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ics-weeks">学期周数（1–30）</Label>
            <Input
              id="ics-weeks"
              type="number"
              min={1}
              max={30}
              value={weeks}
              disabled={pending}
              onChange={(e) => {
                invalidate();
                setWeeks(Number(e.target.value));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ics-school">学校</Label>
            <Input
              id="ics-school"
              value={school}
              maxLength={120}
              disabled={pending}
              onChange={(e) => {
                invalidate();
                setSchool(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ics-mode">导入方式</Label>
            <select
              id="ics-mode"
              className="border rounded-md h-9 px-3 w-full bg-background"
              value={mode}
              disabled={pending}
              onChange={(e) => {
                invalidate();
                setMode(e.target.value as "replace" | "new");
              }}
            >
              <option value="replace">覆盖同名课表（推荐，可重复导入）</option>
              <option value="new" disabled={!canCreateSchedule}>
                新建副本
              </option>
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          课表时区：Asia/Shanghai（北京时间）。保留单双周、EXDATE停课及RECURRENCE-ID调课；不推测额外补课。全天提醒不会变成课程。
        </p>
        <Button onClick={parse} disabled={!file || locked || !name.trim()}>
          {parsing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}解析预览
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {preview && (
          <div className="space-y-3 border-t pt-4">
            <p className="font-medium">
              {preview.semesterTag} · {preview.courses.length}条记录 ·{" "}
              {preview.courses.reduce(
                (n, c) => n + c.endWeek - c.startWeek + 1,
                0,
              )}
              次上课
            </p>
            {preview.warnings.map((w) => (
              <p key={w} className="text-xs text-muted-foreground">
                {w}
              </p>
            ))}
            <div className="max-h-80 overflow-auto border rounded-md">
              <table className="text-sm w-full">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {["课程", "日期/周次", "时间", "老师", "地点"].map((h) => (
                      <th key={h} className="text-left p-2 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.courses.map((c, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{c.name}</td>
                      <td className="p-2 whitespace-nowrap">
                        周{c.dayOfWeek} · {c.startWeek}–{c.endWeek}周
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {c.startTime}–{c.endTime}
                      </td>
                      <td className="p-2">{c.teacher || "未提供"}</td>
                      <td className="p-2">{c.room || "未提供"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={save} disabled={pending}>
              {pending ? "正在保存…" : "确认导入"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
