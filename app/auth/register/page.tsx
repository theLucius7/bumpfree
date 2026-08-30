"use client";

import { useState, useTransition } from "react";
import { RecoveryCode } from "@/components/RecoveryCode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { registerAction } from "@/lib/actions/auth";
import { Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    setError("");
    setSuccessMessage("");
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await registerAction(formData);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      } else if (result?.success && result?.message) {
        setSuccessMessage(result.message);
        setRecoveryCode(result.recoveryCode || "");
        toast.success(result.message);
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
            <CardTitle>{"\u521b\u5efa\u8d26\u53f7"}</CardTitle>
            <CardDescription>
              {
                "\u52a0\u5165 BumpFree\uff0c\u5f00\u59cb\u627e\u5171\u540c\u7a7a\u95f2"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {successMessage ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {successMessage}
                </p>
                <RecoveryCode code={recoveryCode} />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">{"\u6635\u79f0"}</Label>
                  <Input
                    id="displayName"
                    name="displayName"
                    placeholder={"\u4f60\u7684\u540d\u5b57"}
                    required
                    maxLength={50}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{"\u90ae\u7bb1"}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    maxLength={254}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{"\u5bc6\u7801"}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="至少15个字符，可使用多个词"
                    required
                    minLength={15}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {isPending ? "\u6b63\u5728\u6ce8\u518c..." : "\u6ce8\u518c"}
                </Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              邮箱仅作登录标识，未经验证；本站使用恢复码找回密码，不发送邮件。
            </p>
            {!successMessage && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                {"\u5df2\u6709\u8d26\u53f7\uff1f "}
                <Link
                  href="/auth/login"
                  className="text-primary hover:underline"
                >
                  {"\u76f4\u63a5\u767b\u5f55"}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
