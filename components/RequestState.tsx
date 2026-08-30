"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { refreshData, type ApiError } from "@/lib/api";
export function RequestState({ error }: { error?: ApiError }) {
  return (
    <div
      className="max-w-lg mx-auto p-8 space-y-4"
      role={error ? "alert" : "status"}
    >
      <p>{error?.message || "正在加载…"}</p>
      {error && (
        <div className="flex gap-3">
          <Button onClick={refreshData} variant="outline">
            重试
          </Button>
          <Button asChild>
            <Link href={error.status === 401 ? "/auth/login" : "/dashboard"}>
              {error.status === 401 ? "登录" : "返回概览"}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
