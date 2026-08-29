"use client";

import { useState, useTransition } from "react";
import { importWakeUpSchedule } from "@/lib/actions/courses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MAX_WAKEUP_TOKEN_LENGTH = 5_000;

export function WakeUpImportPanel({ hasSchedule }: { hasSchedule: boolean }) {
    const [token, setToken] = useState("");
    const [isPending, startTransition] = useTransition();

    function handleImport() {
        const normalized = token.trim();
        if (!normalized) {
            toast.error("请先粘贴 WakeUp 分享消息或口令");
            return;
        }
        if (normalized.length > MAX_WAKEUP_TOKEN_LENGTH) {
            toast.error("WakeUp 分享消息过长");
            return;
        }

        startTransition(async () => {
            const result = await importWakeUpSchedule(normalized);
            if ("error" in result) {
                toast.error(result.error);
                return;
            }
            toast.success(`已导入「${result.semesterTag}」，共 ${result.courseCount} 条课程`);
            setToken("");
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <Download className="w-4 h-4" aria-hidden="true" />
                    WakeUp 课表导入
                </CardTitle>
                <CardDescription>
                    在 WakeUp 课表中分享当前课表，然后粘贴完整分享消息或 32 位口令。
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="wakeup-token">WakeUp 分享消息 / 口令</Label>
                    <Textarea
                        id="wakeup-token"
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        maxLength={MAX_WAKEUP_TOKEN_LENGTH}
                        rows={4}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="分享口令为「0123456789abcdef0123456789abcdef」"
                        className="font-mono text-xs resize-y"
                    />
                    <p className="text-xs text-muted-foreground">
                        {hasSchedule
                            ? "同名学期会安全覆盖：新课程保存成功后才移除旧课程。"
                            : "导入成功后会创建课表并设为当前课表。"}
                    </p>
                </div>
                <Button type="button" onClick={handleImport} disabled={isPending || !token.trim()} className="w-full">
                    {isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />正在导入...</>
                        : <><CheckCircle2 className="w-4 h-4 mr-2" aria-hidden="true" />导入 WakeUp 课表</>}
                </Button>
            </CardContent>
        </Card>
    );
}
