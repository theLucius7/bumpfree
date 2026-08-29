"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importTextSchedule } from "@/lib/actions/courses";
import type { ImportInterfaceConfig } from "@/lib/utils/importInterfaces";
import { scheduleAdapterRegistry } from "@/lib/utils/scheduleAdapters/registry";
import {
    getAiCleanupPrompt,
    getScheduleTemplate,
    MAX_SCHEDULE_TEXT_LENGTH,
    validateParsedTextSchedule,
    type ParsedTextSchedule,
    type TextScheduleImportMode,
} from "@/lib/utils/textSchedule";
import { Clipboard, FileImage, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

const TEXT = {
    title: "\u5bfc\u5165\u8bfe\u8868",
    description: "\u7531\u540e\u53f0\u63a5\u53e3\u7ba1\u7406\u63a7\u5236\u53ef\u7528\u5165\u53e3\uff1b\u901a\u7528\u683c\u5f0f\u548c\u5b66\u6821\u4e13\u7528\u683c\u5f0f\u53ef\u4ee5\u6309\u9700\u542f\u7528\u3002",
    copied: "\u5df2\u590d\u5236",
    copyFailed: "\u590d\u5236\u5931\u8d25",
    parseFailed: "\u89e3\u6790\u8bfe\u8868\u6587\u672c\u5931\u8d25",
    importedPrefix: "\u5df2\u5bfc\u5165\u300c",
    importedMiddle: "\u300d\uff0c\u5171 ",
    importedSuffix: " \u6761\u8bfe\u7a0b",
    copyTemplate: "\u590d\u5236\u683c\u5f0f\u6a21\u677f",
    copyAiPrompt: "\u590d\u5236 AI \u6574\u7406\u63d0\u793a\u8bcd",
    copyCustomPrompt: "\u590d\u5236\u8be5\u683c\u5f0f AI \u63d0\u793a\u8bcd",
    templateLabel: "\u683c\u5f0f\u6a21\u677f",
    aiPromptLabel: "AI \u6574\u7406\u63d0\u793a\u8bcd",
    parsePreview: "\u89e3\u6790\u9884\u89c8",
    dropReady: "\u62d6\u62fd\u6587\u4ef6\u5230\u8fd9\u91cc\uff0c\u6216\u70b9\u51fb\u53f3\u4e0a\u89d2\u4e0a\u4f20",
    editMeta: "\u624b\u5de5\u4fee\u6539\u5b66\u671f",
    semesterTag: "\u5b66\u671f",
    startDate: "\u7b2c 1 \u5468\u5468\u4e00",
    maxWeeks: "\u603b\u5468\u6570",
    importMode: "\u5bfc\u5165\u65b9\u5f0f",
    replace: "\u8986\u76d6",
    append: "\u8ffd\u52a0",
    newCopy: "\u65b0\u5efa\u526f\u672c",
    strict: "\u6807\u51c6\u683c\u5f0f",
    loose: "\u677e\u6563\u683c\u5f0f",
    start: "\u8d77\u59cb",
    weeksUnit: " \u5468",
    coursesUnit: " \u6761\u8bfe\u7a0b",
    day: "\u661f\u671f",
    time: "\u65f6\u95f4",
    course: "\u8bfe\u7a0b",
    room: "\u6559\u5ba4",
    weeks: "\u5468\u6b21",
    morePrefix: "\u8fd8\u6709 ",
    moreSuffix: " \u6761\u8bfe\u7a0b\u672a\u5c55\u793a",
    importing: "\u6b63\u5728\u5bfc\u5165...",
    confirmImport: "\u786e\u8ba4\u5bfc\u5165",
    manualSubmitted: "已提交人工处理",
    submitManual: "提交给管理员处理",
    submitting: "正在提交...",
    selectedFile: "已选择文件",
};

const DAY_NAMES = ["", "\u5468\u4e00", "\u5468\u4e8c", "\u5468\u4e09", "\u5468\u56db", "\u5468\u4e94", "\u5468\u516d", "\u5468\u65e5"];

export function ScheduleImportPanel({ interfaces, canCreateSchedule }: { interfaces: ImportInterfaceConfig[]; canCreateSchedule: boolean }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {TEXT.title}
                </CardTitle>
                <CardDescription>{TEXT.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {interfaces.map((item, index) => (
                    <div key={item.id} className={index === 0 ? "" : "border-t border-border/60 pt-5"}>
                        {item.features?.manualReview ? (
                            <ManualReviewSubmission config={item} />
                        ) : (
                            <TextScheduleImport config={item} canCreateSchedule={canCreateSchedule} />
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

function ManualReviewSubmission({ config }: { config: ImportInterfaceConfig }) {
    const [text, setText] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleSubmit() {
        if (!text.trim() && !file) return;
        if (file && file.size > 2 * 1024 * 1024) {
            toast.error("文件不能超过 2MB");
            return;
        }
        startTransition(async () => {
            try {
                const formData = new FormData();
                formData.set("text", text);
                if (file) formData.set("file", file);
                const response = await fetch("/api/manual-schedule-submissions", {
                    method: "POST",
                    body: formData,
                });
                const result = await response.json() as { error?: string; success?: boolean };
                if (!response.ok || result.error) {
                    toast.error(result.error || "提交失败");
                    return;
                }
                toast.success(TEXT.manualSubmitted);
                setText("");
                setFile(null);
            } catch {
                toast.error("提交失败，请检查网络后重试");
            }
        });
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FileImage className="w-4 h-4" />
                    {config.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                {config.hints.map((hint) => <p key={hint}>{hint}</p>)}
            </div>

            <div className="space-y-2 rounded-md border border-dashed border-border/80 p-3 transition-colors hover:bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`manual-text-${config.id}`}>{config.inputLabel}</Label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />{config.uploadLabel}
                        <input
                            type="file"
                            accept={config.acceptedFileTypes}
                            className="hidden"
                            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                        />
                    </label>
                </div>
                <Textarea
                    id={`manual-text-${config.id}`}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={config.placeholder}
                    rows={5}
                    maxLength={50_000}
                    className="text-sm resize-y"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                        {file ? `${TEXT.selectedFile}：${file.name}` : "支持上传图片或文本文件，最多 2MB。"}
                    </p>
                    <Button type="button" onClick={handleSubmit} disabled={isPending || (!text.trim() && !file)}>
                        {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{TEXT.submitting}</> : TEXT.submitManual}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function TextScheduleImport({ config, canCreateSchedule }: { config: ImportInterfaceConfig; canCreateSchedule: boolean }) {
    const [text, setText] = useState("");
    const [preview, setPreview] = useState<ParsedTextSchedule | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [importMode, setImportMode] = useState<TextScheduleImportMode>("replace");
    const [isPending, startTransition] = useTransition();
    const [isExtracting, startExtractTransition] = useTransition();

    function applyText(nextText: string): boolean {
        if (nextText.length > MAX_SCHEDULE_TEXT_LENGTH) {
            setText("");
            setPreview(null);
            setParseError(`课表文本不能超过 ${MAX_SCHEDULE_TEXT_LENGTH} 个字符`);
            return false;
        }
        setText(nextText);
        setPreview(null);
        setParseError(null);
        return true;
    }

    function copyText(value: string, label: string) {
        void navigator.clipboard.writeText(value).then(
            () => toast.success(`${TEXT.copied}${label}`),
            () => toast.error(`${label}${TEXT.copyFailed}`)
        );
    }

    function handleParse() {
        try {
            const parsed = scheduleAdapterRegistry.parse(config.adapterKey, text);
            setPreview(parsed);
            setImportMode(parsed.importMode === "new" && !canCreateSchedule ? "replace" : parsed.importMode);
            setParseError(null);
        } catch (e) {
            setPreview(null);
            setParseError(e instanceof Error ? e.message : TEXT.parseFailed);
        }
    }

    function handleFile(file: File | undefined) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error("文件不能超过 5MB");
            return;
        }
        startExtractTransition(async () => {
            try {
                const formData = new FormData();
                formData.set("file", file);
                const response = await fetch("/api/schedule-files/extract", {
                    method: "POST",
                    body: formData,
                });
                const result = await response.json() as { error?: string; text?: string };
                if (!response.ok || result.error) {
                    toast.error(result.error || "文件文本抽取失败");
                    return;
                }
                if (applyText(result.text ?? "")) toast.success("\u6587\u4ef6\u6587\u672c\u5df2\u62bd\u53d6");
            } catch {
                toast.error("文件文本抽取失败，请检查网络后重试");
            }
        });
    }

    function handleImport() {
        if (!text.trim() || !preview) return;
        let normalized: ParsedTextSchedule;
        try {
            normalized = validateParsedTextSchedule({ ...preview, importMode });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : TEXT.parseFailed);
            return;
        }
        if (importMode === "new" && !canCreateSchedule) {
            toast.error("课表额度已满，不能新建副本");
            return;
        }
        startTransition(async () => {
            const result = await importTextSchedule(serializeForImport(normalized), importMode);
            if ("error" in result) {
                toast.error(result.error);
                return;
            }
            toast.success(`${TEXT.importedPrefix}${result.semesterTag}${TEXT.importedMiddle}${result.courseCount}${TEXT.importedSuffix}`);
            setText("");
            setPreview(null);
            setParseError(null);
        });
    }

    const rows = config.adapterKey === "generic-text" ? 10 : 7;

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold">{config.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
            </div>

            {config.features?.showTemplateTools && (
                <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => copyText(getScheduleTemplate(), TEXT.templateLabel)}>
                        <FileText className="w-4 h-4 mr-2" />{TEXT.copyTemplate}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => copyText(getAiCleanupPrompt(), TEXT.aiPromptLabel)}>
                        <Clipboard className="w-4 h-4 mr-2" />{TEXT.copyAiPrompt}
                    </Button>
                </div>
            )}

            {config.customMeta?.aiPrompt && (
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(config.customMeta?.aiPrompt || "", TEXT.aiPromptLabel)}>
                    <Clipboard className="w-4 h-4 mr-2" />{TEXT.copyCustomPrompt}
                </Button>
            )}

            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                {config.hints.map((hint) => <p key={hint}>{hint}</p>)}
            </div>

            <div
                className="space-y-2 rounded-md border border-dashed border-border/80 p-3 transition-colors hover:bg-muted/20"
                onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    handleFile(event.dataTransfer.files?.[0]);
                }}
                >
                <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`schedule-text-${config.id}`}>{config.inputLabel}</Label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                        {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {isExtracting ? "正在读取..." : config.uploadLabel}
                        <input
                            type="file"
                            accept={config.acceptedFileTypes}
                            className="hidden"
                            disabled={isExtracting}
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />
                    </label>
                </div>
                <Textarea
                    id={`schedule-text-${config.id}`}
                    value={text}
                    onChange={(e) => {
                        applyText(e.target.value);
                    }}
                    placeholder={config.placeholder}
                    rows={rows}
                    maxLength={MAX_SCHEDULE_TEXT_LENGTH}
                    className="font-mono text-xs resize-y"
                />
                <p className="text-xs text-muted-foreground">{TEXT.dropReady} · {text.length.toLocaleString()} / {MAX_SCHEDULE_TEXT_LENGTH.toLocaleString()}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={handleParse} disabled={!text.trim()}>
                    {TEXT.parsePreview}
                </Button>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{TEXT.importMode}</span>
                    <Select value={importMode} onValueChange={(value) => setImportMode(value as TextScheduleImportMode)}>
                        <SelectTrigger className="w-32" size="sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="replace">{TEXT.replace}</SelectItem>
                            <SelectItem value="append">{TEXT.append}</SelectItem>
                            <SelectItem value="new" disabled={!canCreateSchedule}>{TEXT.newCopy}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {parseError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {parseError}
                </div>
            )}

            {preview && (
                <div className="space-y-3 rounded-md border border-border/60 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="secondary">{preview.format === "strict" ? TEXT.strict : TEXT.loose}</Badge>
                        <span className="font-medium">{preview.semesterTag}</span>
                        <span className="text-muted-foreground">{TEXT.start} {preview.startDate}</span>
                        <span className="text-muted-foreground">{preview.maxWeeks}{TEXT.weeksUnit}</span>
                        <span className="text-muted-foreground">{preview.courses.length}{TEXT.coursesUnit}</span>
                    </div>
                    {preview.warnings.length > 0 && (
                        <div className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                            {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-3 rounded-md bg-muted/25 p-3">
                        <div className="space-y-1.5">
                            <Label htmlFor={`semester-${config.id}`} className="text-xs">{TEXT.semesterTag}</Label>
                            <Input
                                id={`semester-${config.id}`}
                                value={preview.semesterTag}
                                onChange={(event) => setPreview({ ...preview, semesterTag: event.target.value })}
                                maxLength={80}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`start-date-${config.id}`} className="text-xs">{TEXT.startDate}</Label>
                            <Input
                                id={`start-date-${config.id}`}
                                type="date"
                                min="2000-01-01"
                                max="2100-12-31"
                                value={preview.startDate}
                                onChange={(event) => setPreview({ ...preview, startDate: event.target.value })}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`max-weeks-${config.id}`} className="text-xs">{TEXT.maxWeeks}</Label>
                            <Input
                                id={`max-weeks-${config.id}`}
                                type="number"
                                min={1}
                                max={30}
                                value={preview.maxWeeks}
                                onChange={(event) => setPreview({ ...preview, maxWeeks: Number(event.target.value) || preview.maxWeeks })}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="text-muted-foreground">
                                <tr className="border-b">
                                    <th className="py-1 pr-2 text-left">{TEXT.day}</th>
                                    <th className="py-1 pr-2 text-left">{TEXT.time}</th>
                                    <th className="py-1 pr-2 text-left">{TEXT.course}</th>
                                    <th className="py-1 pr-2 text-left">{TEXT.room}</th>
                                    <th className="py-1 pr-2 text-left">{TEXT.weeks}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.courses.slice(0, 8).map((course, index) => (
                                    <tr key={`${course.name}-${index}`} className="border-b last:border-0">
                                        <td className="py-1 pr-2 whitespace-nowrap">{DAY_NAMES[course.dayOfWeek]}</td>
                                        <td className="py-1 pr-2 whitespace-nowrap">{course.startTime}-{course.endTime}</td>
                                        <td className="py-1 pr-2 min-w-40">{course.name}</td>
                                        <td className="py-1 pr-2 whitespace-nowrap">{course.room || "-"}</td>
                                        <td className="py-1 pr-2 whitespace-nowrap">{course.startWeek}-{course.endWeek}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {preview.courses.length > 8 && (
                        <p className="text-xs text-muted-foreground">{TEXT.morePrefix}{preview.courses.length - 8}{TEXT.moreSuffix}</p>
                    )}
                    {!canCreateSchedule && (
                        <p className="text-xs text-muted-foreground">课表额度已满：可覆盖或追加同名学期，但不能新建副本。</p>
                    )}
                    <Button type="button" onClick={handleImport} disabled={isPending || (importMode === "new" && !canCreateSchedule)} className="w-full">
                        {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{TEXT.importing}</> : TEXT.confirmImport}
                    </Button>
                </div>
            )}
        </div>
    );
}

function serializeForImport(parsed: ParsedTextSchedule): string {
    const header = [
        "BumpFree Schedule Import v1",
        `Semester: ${parsed.semesterTag}`,
        `StartDate: ${parsed.startDate}`,
        `Timezone: ${parsed.timezone}`,
        `MaxWeeks: ${parsed.maxWeeks}`,
        `School: ${parsed.school}`,
        `ImportMode: ${parsed.importMode}`,
    ].join("\n");

    const blocks = parsed.courses.map((course) => [
        "---",
        `Day: ${DAY_NAMES[course.dayOfWeek]}`,
        `Time: ${course.startTime}-${course.endTime}`,
        `Name: ${course.name}`,
        `Teacher: ${course.teacher}`,
        `Room: ${course.room}`,
        `Weeks: ${course.startWeek}-${course.endWeek}`,
        course.note ? `Note: ${course.note}` : null,
        course.color ? `Color: ${course.color}` : null,
    ].filter(Boolean).join("\n"));

    return [header, ...blocks].join("\n\n");
}
