"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAction } from "@/lib/actions/auth";
import { Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string>("");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
            const result = await loginAction(formData);
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
                        <CardTitle>欢迎回来</CardTitle>
                        <CardDescription>登录你的 BumpFree 账号</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">邮箱</Label>
                                <Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">密码</Label>
                                <Input id="password" name="password" type="password" placeholder="至少 6 位" required autoComplete="current-password" />
                            </div>
                            {error && <p className="text-sm text-destructive">{error}</p>}
                            <Button type="submit" className="w-full" disabled={isPending}>
                                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                登录
                            </Button>
                        </form>
                        <div className="mt-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-4">
                            <span>
                                还没有账号？{" "}
                                <Link href="/auth/register" className="text-primary hover:underline">免费注册</Link>
                            </span>
                            <span className="text-border">|</span>
                            <Link href="/auth/forgot-password" className="text-primary hover:underline">忘记密码？</Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
