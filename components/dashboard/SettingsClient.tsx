"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateProfileAction, updateAuthAction } from "@/lib/actions/settings";
import { toast } from "sonner";
import { useTransition } from "react";
import { Loader2, User, Mail, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { springSnappy } from "@/lib/animations";
import { PageWrapper } from "@/components/motion/PageWrapper";

interface SettingsClientProps {
  initialDisplayName: string;
  initialEmail: string;
}

export function SettingsClient({
  initialDisplayName,
  initialEmail,
}: SettingsClientProps) {
  const [isProfilePending, startProfileTransition] = useTransition();
  const [isAuthPending, startAuthTransition] = useTransition();

  async function handleProfileSubmit(formData: FormData) {
    startProfileTransition(async () => {
      const result = await updateProfileAction(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("基础信息已保存");
      }
    });
  }

  async function handleAuthSubmit(formData: FormData) {
    startAuthTransition(async () => {
      const result = await updateAuthAction(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message || "账号安全信息已更新");
      }
    });
  }

  return (
    <PageWrapper className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">账号设置</h1>
        <p className="text-muted-foreground text-sm mt-1">
          管理你的基础信息和账号安全
        </p>
      </div>

      <motion.div whileHover={{ scale: 1.01 }} transition={springSnappy}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="w-5 h-5 text-primary" />
              基础信息
            </CardTitle>
            <CardDescription>
              这将决定你在各种 Room 日历中显示的名字。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleProfileSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">显示名称</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  defaultValue={initialDisplayName}
                  placeholder="输入你在系统里的名字"
                  required
                  maxLength={50}
                />
              </div>
              <Button type="submit" disabled={isProfilePending}>
                {isProfilePending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                保存修改
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div whileHover={{ scale: 1.01 }} transition={springSnappy}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="w-5 h-5 text-primary" />
              账号安全
            </CardTitle>
            <CardDescription>
              修改安全信息需验证当前密码。邮箱仅作登录标识，不发送验证邮件。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleAuthSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  登录邮箱
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={initialEmail}
                  placeholder="更换你的登录邮箱"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentPassword">当前密码</Label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">新密码（至少15个字符）</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="留空则不修改密码"
                  minLength={15}
                  maxLength={128}
                />
              </div>

              <Button
                type="submit"
                variant="secondary"
                disabled={isAuthPending}
              >
                {isAuthPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                更新安全信息
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </PageWrapper>
  );
}
