"use client";
import { useEffect, useState } from "react";
import type {
  Profile,
  Schedule,
  Course,
  Room,
  Invitation,
  AdminUser,
} from "./types";
import type { ImportInterfaceConfig } from "./utils/importInterfaces";
import type { ManualScheduleSubmission } from "./actions/manual-submissions";

export type Me = {
  user: { id: string; email: string } | null;
  profile: Profile | null;
};
export type ScheduleWithCourses = Schedule & { courses: Course[] };
export type ManagedRoom = Room & { room_members: { count: number }[] };
export type DashboardData = Me & {
  roomCount: number;
  scheduleCount: number;
  invitationCount: number;
  memberRooms: { room: Room }[];
};
export type SchedulesData = Me & {
  schedules: ScheduleWithCourses[];
  importInterfaces: ImportInterfaceConfig[];
};
export type AdminData = Me & {
  users: AdminUser[];
  stats: { userCount: number; roomCount: number };
};
export type AdminSettingsData = {
  importInterfaces: ImportInterfaceConfig[];
  manualSubmissions: ManualScheduleSubmission[];
};
export type InvitationsData = {
  invitations: (Invitation & { room: Room; inviter: Profile })[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function refreshData() {
  window.dispatchEvent(new Event("bumpfree:refresh"));
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/" + path, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError("连接超时或网络不可用；请刷新确认保存状态后再重试", 0);
  }
  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  if (!isJson)
    throw new ApiError(
      "API 暂不可用；请刷新确认保存状态后再重试",
      response.status,
    );
  const value = await response.json();
  if (!response.ok || value.error)
    throw new ApiError(value.error || "请求失败", response.status);
  return value;
}
export type ActionResult = {
  success?: boolean;
  error?: string;
  message?: string;
  roomId?: string;
  courseCount?: number;
  semesterTag?: string;
  importMode?: string;
  scheduleId?: string;
  invitedCount?: number;
  failed?: string[];
  recoveryCode?: string;
  inviteLinks?: { email: string; url: string }[];
  notice?: { courseName: string; startsAt: string; endsAt: string };
};
export async function action(
  name: string,
  ...args: unknown[]
): Promise<ActionResult> {
  try {
    const normalized = args.map((value) =>
      value instanceof FormData ? Object.fromEntries(value) : value,
    );
    const result = await api<ActionResult>("actions/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: normalized }),
    });
    refreshData();
    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "请求失败，请重试",
    };
  }
}
export function useResource<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: ApiError }>({});
  useEffect(() => {
    if (!path) return;
    let active = true;
    let sequence = 0;
    async function reload() {
      const current = ++sequence;
      try {
        const data = await api<T>(path!);
        if (active && current === sequence) setState({ data });
      } catch (error) {
        if (active && current === sequence)
          setState({ error: error as ApiError });
      }
    }
    void reload();
    window.addEventListener("bumpfree:refresh", reload);
    return () => {
      active = false;
      window.removeEventListener("bumpfree:refresh", reload);
    };
  }, [path]);
  return state;
}
