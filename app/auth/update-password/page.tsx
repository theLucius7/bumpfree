"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { api } from "@/lib/api";
import { updatePasswordFromRecoveryAction } from "@/lib/actions/auth";
import { RecoveryCode } from "@/components/RecoveryCode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
export default function ActivatePage() {
  const [token, setToken] = useState(""),
    [params, setParams] = useState<{ email: string; salt: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^[a-f0-9]{64}$/.test(value)) {
      queueMicrotask(() =>
        setError("缺少有效激活链接，请使用管理员发送的完整链接"),
      );
      return;
    }
    void api<{ email: string; salt: string }>("auth/invite-parameters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: value }),
    }).then(
      (p) => {
        setToken(value);
        setParams(p);
      },
      (e) => setError(e.message),
    );
  }, []);
  function submit(form: FormData) {
    if (form.get("password") !== form.get("confirmPassword")) {
      setError("两次输入的密码不一致");
      return;
    }
    form.set("token", token);
    form.set("salt", params?.salt || "");
    startTransition(async () => {
      const result = await updatePasswordFromRecoveryAction(form);
      if (result.error) setError(result.error);
      else setCode(result.recoveryCode || "");
    });
  }
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>激活 BumpFree 账号</CardTitle>
          <CardDescription>
            {params?.email || "验证邀请链接…"} · 设置自己的密码
          </CardDescription>
        </CardHeader>
        <CardContent>
          {code ? (
            <RecoveryCode code={code} />
          ) : (
            <form action={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">新密码</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  minLength={15}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                  placeholder="至少15个字符，可使用多个词"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  minLength={15}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button disabled={!params || pending} type="submit">
                {pending ? "正在激活…" : "设置密码并激活"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
