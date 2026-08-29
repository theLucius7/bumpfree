"use client";

import { useState, useTransition } from "react";
import { importRescheduleNotice } from "@/lib/actions/busy";
import { getRescheduleAiPrompt, getRescheduleNoticeTemplate, parseRescheduleNotice, type ParsedRescheduleNotice } from "@/lib/utils/rescheduleNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clipboard, Loader2, Repeat2 } from "lucide-react";
import { toast } from "sonner";

const T = {
    copied: "\u5df2\u590d\u5236",
    copyFailed: "\u590d\u5236\u5931\u8d25",
    parseFailed: "\u89e3\u6790\u8c03\u8bfe\u901a\u77e5\u5931\u8d25",
    imported: "\u5df2\u52a0\u5165\u8c03\u8bfe busy \u65f6\u95f4",
    title: "\u5355\u8282\u8c03\u8bfe\u901a\u77e5",
    desc: "\u7c98\u8d34\u8001\u5e08\u53d1\u5e03\u7684\u5355\u8282\u8bfe\u8c03\u8bfe\u6587\u5b57\uff0c\u786e\u8ba4\u540e\u4f1a\u52a0\u5165\u4e00\u6bb5\u4e00\u6b21\u6027 busy \u65f6\u95f4\u3002",
    template: "\u8c03\u8bfe\u6a21\u677f",
    aiPrompt: "\u8c03\u8bfe AI \u63d0\u793a\u8bcd",
    copyTemplate: "\u590d\u5236\u8c03\u8bfe\u6a21\u677f",
    copyPrompt: "\u590d\u5236\u8c03\u8bfe AI \u63d0\u793a\u8bcd",
    hint: "\u5efa\u8bae\u7528\u6807\u51c6\u683c\u5f0f\uff1aDate / Time / Course / Teacher / Room\u3002\u677e\u6563\u6587\u672c\u4f1a\u5c1d\u8bd5\u8bc6\u522b\uff0c\u4f46\u4e0d\u4f1a\u731c\u6ca1\u5199\u6e05\u7684\u65e5\u671f\u3002",
    text: "\u8c03\u8bfe\u901a\u77e5\u6587\u672c",
    placeholder: "\u7c98\u8d34\u8c03\u8bfe\u901a\u77e5\uff0c\u6216 BumpFree Reschedule Notice v1 \u6587\u672c...",
    preview: "\u89e3\u6790\u9884\u89c8",
    start: "\u5f00\u59cb",
    end: "\u7ed3\u675f",
    teacher: "\u8001\u5e08",
    room: "\u6559\u5ba4",
    importing: "\u6b63\u5728\u5bfc\u5165...",
    confirm: "\u786e\u8ba4\u52a0\u5165 busy",
};

export function RescheduleNoticeImportPanel() {
    const [text, setText] = useState("");
    const [preview, setPreview] = useState<ParsedRescheduleNotice | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function copyText(value: string, label: string) {
        void navigator.clipboard.writeText(value).then(() => toast.success(`${T.copied}${label}`), () => toast.error(`${label}${T.copyFailed}`));
    }

    function parsePreview() {
        try {
            setPreview(parseRescheduleNotice(text));
            setError(null);
        } catch (e) {
            setPreview(null);
            setError(e instanceof Error ? e.message : T.parseFailed);
        }
    }

    function importNotice() {
        startTransition(async () => {
            const result = await importRescheduleNotice(text);
            if (result.error) { toast.error(result.error); return; }
            toast.success(T.imported);
            setText(""); setPreview(null); setError(null);
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Repeat2 className="w-4 h-4" />{T.title}</CardTitle>
                <CardDescription>{T.desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => copyText(getRescheduleNoticeTemplate(), T.template)}><Repeat2 className="w-4 h-4 mr-2" />{T.copyTemplate}</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => copyText(getRescheduleAiPrompt(), T.aiPrompt)}><Clipboard className="w-4 h-4 mr-2" />{T.copyPrompt}</Button>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">{T.hint}</div>
                <div className="space-y-2">
                    <Label htmlFor="reschedule-notice">{T.text}</Label>
                    <Textarea id="reschedule-notice" value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setError(null); }} placeholder={T.placeholder} rows={7} className="font-mono text-xs resize-y" />
                </div>
                <Button type="button" variant="outline" onClick={parsePreview} disabled={!text.trim()}>{T.preview}</Button>
                {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
                {preview && (
                    <div className="space-y-3 rounded-md border border-border/60 p-3 text-sm">
                        <div className="flex flex-wrap gap-2"><Badge variant="secondary">busy</Badge><span className="font-medium">{preview.courseName}</span></div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Preview label={T.start} value={formatDateTime(preview.startsAt)} />
                            <Preview label={T.end} value={formatDateTime(preview.endsAt)} />
                            <Preview label={T.teacher} value={preview.teacher || "-"} />
                            <Preview label={T.room} value={preview.room || "-"} />
                        </div>
                        {preview.warnings.length > 0 && <div className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
                        <Button onClick={importNotice} disabled={isPending} className="w-full">{isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{T.importing}</> : T.confirm}</Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function Preview({ label, value }: { label: string; value: string }) {
    return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium break-words">{value}</p></div>;
}
function formatDateTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
