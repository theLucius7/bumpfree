"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function RecoveryCode({ code }: { code: string }) {
  return (
    <div className="space-y-4 text-left">
      <p className="text-sm">
        这是仅显示一次的账号恢复码。请保存在密码管理器或离线安全位置；密码和恢复码同时丢失将无法找回。
      </p>
      <code className="block rounded-md bg-muted p-3 text-xs break-all select-all">
        {code}
      </code>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          void navigator.clipboard.writeText(code).then(
            () => toast.success("已复制，请安全保存"),
            () => toast.error("复制失败，请手动选择恢复码"),
          )
        }
      >
        复制恢复码
      </Button>
      <Button asChild className="w-full">
        <Link href="/auth/login/">我已保存，前往登录</Link>
      </Button>
    </div>
  );
}
