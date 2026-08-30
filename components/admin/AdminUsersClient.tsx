"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  updateUserQuota,
  toggleUserRole,
  updateUserScheduleQuota,
  bulkInviteUsers,
} from "@/lib/actions/admin";
import { toast } from "sonner";
import { Shield, User, Loader2, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { AdminUser } from "@/lib/types";
import { motion } from "framer-motion";
import { springSnappy } from "@/lib/animations";

interface AdminUsersClientProps {
  users: AdminUser[];
  currentUserId: string;
}

export function AdminUsersClient({
  users,
  currentUserId,
}: AdminUsersClientProps) {
  const [inviteLinks, setInviteLinks] = useState<
    { email: string; url: string }[]
  >([]);
  const [bulkText, setBulkText] = useState("");
  const [isBulkPending, startBulkTransition] = useTransition();

  function handleBulkInvite() {
    const formData = new FormData();
    formData.set("lines", bulkText);

    startBulkTransition(async () => {
      const result = await bulkInviteUsers(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`已生成 ${result.invitedCount} 个邀请链接`);
      setInviteLinks(result.inviteLinks || []);
      const failedCount = result.failed?.length ?? 0;
      if (failedCount > 0) {
        toast.warning(`有 ${failedCount} 个账号已存在或未创建，请检查邀请列表`);
      }
      setBulkText("");
    });
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">邀请用户</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            每行一个邀请，格式：邮箱,昵称[,数量]。系统生成有效期7天的一次性激活链接，请通过可信渠道手动分享，不创建共享或弱密码。
            批量时可用 {"{n}"} 占位；数量默认 1，单次最多 100 人。
          </p>
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={
              "student{n}@example.com,学生{n},5\nsolo@example.com,单人用户"
            }
            className="min-h-36"
          />
          <Button
            onClick={handleBulkInvite}
            disabled={isBulkPending || !bulkText.trim()}
          >
            {isBulkPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "生成邀请链接"
            )}
          </Button>
        </CardContent>
      </Card>
      {inviteLinks.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm">
              激活链接只在本次结果中展示，请安全保存并单独发送给对应用户。
            </p>
            {inviteLinks.map((link) => (
              <div
                key={link.email}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="text-sm">{link.email}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(link.url).then(
                      () => toast.success("已复制"),
                      () => toast.error("复制失败"),
                    )
                  }
                >
                  复制激活链接
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <h2 className="text-base font-semibold">用户列表 ({users.length})</h2>
      {users.map((u) => (
        <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} />
      ))}
    </div>
  );
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [quota, setQuota] = useState(String(user.room_quota));
  const [scheduleQuota, setScheduleQuota] = useState(
    String(user.schedule_quota ?? 3),
  );
  const [isPending, startTransition] = useTransition();
  const [isSchedulePending, startScheduleTransition] = useTransition();
  const [isRolePending, startRoleTransition] = useTransition();

  function handleQuotaUpdate() {
    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("roomQuota", quota);
    startTransition(async () => {
      const result = await updateUserQuota(formData);
      if (result.error) toast.error(result.error);
      else toast.success("Room 额度已更新");
    });
  }

  function handleScheduleQuotaUpdate() {
    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("scheduleQuota", scheduleQuota);
    startScheduleTransition(async () => {
      const result = await updateUserScheduleQuota(formData);
      if (result.error) toast.error(result.error);
      else toast.success("课表额度已更新");
    });
  }

  function handleRoleToggle() {
    if (isSelf) return;
    startRoleTransition(async () => {
      const result = await toggleUserRole(user.id);
      if (result?.error) toast.error(result.error);
      else toast.success("角色已更新");
    });
  }

  return (
    <motion.div
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      transition={springSnappy}
    >
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{user.display_name}</span>
                <Badge
                  variant={user.role === "superadmin" ? "default" : "outline"}
                  className="text-xs gap-1"
                >
                  {user.role === "superadmin" ? (
                    <Shield className="w-3 h-3" />
                  ) : (
                    <User className="w-3 h-3" />
                  )}
                  {user.role === "superadmin" ? "管理员" : "普通用户"}
                </Badge>
                {isSelf && (
                  <Badge variant="secondary" className="text-xs">
                    你
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                注册于{" "}
                {format(new Date(user.created_at), "yyyy年MM月dd日", {
                  locale: zhCN,
                })}
              </p>
              {user.email && (
                <p className="text-xs text-muted-foreground mt-0.5 break-all">
                  {user.email}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-4 sm:mt-0">
              <QuotaEditor
                label="课表额度"
                value={scheduleQuota}
                setValue={setScheduleQuota}
                disabled={
                  isSchedulePending ||
                  scheduleQuota === String(user.schedule_quota)
                }
                pending={isSchedulePending}
                onSave={handleScheduleQuotaUpdate}
              />
              <QuotaEditor
                label="Room 额度"
                value={quota}
                setValue={setQuota}
                disabled={isPending || quota === String(user.room_quota)}
                pending={isPending}
                onSave={handleQuotaUpdate}
              />
              {!isSelf && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleRoleToggle}
                  disabled={isRolePending}
                >
                  {isRolePending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : user.role === "superadmin" ? (
                    "降为普通"
                  ) : (
                    "升为管理"
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function QuotaEditor({
  label,
  value,
  setValue,
  disabled,
  pending,
  onSave,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  disabled: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <Input
        className="w-16 h-7 text-xs text-center"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="number"
        min="0"
        max="100"
      />
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={onSave}
        disabled={disabled}
      >
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : "保存"}
      </Button>
    </div>
  );
}
