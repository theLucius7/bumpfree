"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updatePasswordFromRecoveryAction } from "@/lib/actions/auth";
import { Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function UpdatePasswordPage() {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string>("");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        const formData = new FormData(e.currentTarget);

        const password = formData.get("password") as string;
        const confirmPassword = formData.get("confirmPassword") as string;

        if (password !== confirmPassword) {
            setError("两次输入的密码不一致");
            return;
        }

        startTransition(async () => {
            const result = await updatePasswordFromRecoveryAction(formData);
            if (result?.error) {
                setError(result.error);
                toast.error(result.error);
            }
        });
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="w-full max-w-sm">
                <div className="flex items-center justify-center gap-2 mb-8">
                    <Zap className="w-6 h-6 text-primary" />
                    <span className="text-xl font-semibold">BumpFree</span>
                </div>
                <Card>
                    <CardHeader className="text-center">
                        <CardTitle>设置新密码</CardTitle>
                        <CardDescription>请输入新的登录密码</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="password">新密码</Label>
                                <Input id="password" name="password" type="password" placeholder="至少 8 位" required minLength={8} maxLength={128} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">确认新密码</Label>
                                <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="再次输入密码" required minLength={8} maxLength={128} />
                            </div>
                            {error && <p className="text-sm text-destructive">{error}</p>}
                            <Button type="submit" className="w-full" disabled={isPending}>
                                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                确认修改
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
