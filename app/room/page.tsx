"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap, Globe, Users } from "lucide-react";
import { useResource } from "@/lib/api";
import { RequestState } from "@/components/RequestState";
import { RoomCalendar } from "@/components/calendar/RoomCalendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDisplayMemberColor } from "@/lib/utils/colors";
import type {
  Room,
  Schedule,
  Course,
  BusyBlock,
  MalaysiaHoliday,
} from "@/lib/types";
type Payload = {
  room: Room;
  members: {
    user_id: string;
    display_name: string;
    joined_at: string;
    color: string;
    schedule: (Schedule & { courses: Course[] }) | null;
    busy_blocks: BusyBlock[];
  }[];
  currentUserId: string | null;
  isMember: boolean;
  holidays: MalaysiaHoliday[];
};
export default function RoomPage() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const legacy = window.location.pathname.match(
      /^\/room\/([a-f0-9-]{36})\/?$/i,
    )?.[1];
    setId(
      new URLSearchParams(window.location.search).get("id") ||
        legacy ||
        "invalid",
    );
  }, []);
  const valid = !!id && /^[a-f0-9-]{36}$/i.test(id);
  const { data, error } = useResource<Payload>(
    valid ? "rooms/" + id + "/calendar" : null,
  );
  if (!data)
    return id && !valid ? (
      <div className="p-8">
        Room链接无效。<Link href="/dashboard/rooms/">返回我的Room</Link>
      </div>
    ) : (
      <RequestState error={error} />
    );
  const colors: string[] = [];
  const members = data.members.map((m) => {
    const color = getDisplayMemberColor(m.user_id, m.color, colors);
    colors.push(color);
    return {
      userId: m.user_id,
      displayName: m.display_name || "未命名用户",
      color,
      schedule: m.schedule,
      courses: (m.schedule?.courses || []).map((c) => ({
        ...c,
        user_id: m.user_id,
        schedule_id: m.schedule!.id,
        created_at: "",
      })),
      busyBlocks: m.busy_blocks.map((b) => ({
        ...b,
        user_id: m.user_id,
        created_at: "",
      })),
    };
  });
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b sticky top-0 z-40 bg-background/95">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="flex gap-1 items-center">
              <Zap className="w-4 h-4 text-primary" />
              <span className="hidden sm:inline">BumpFree</span>
            </Link>
            <span>/</span>
            <h1 className="font-semibold truncate">{data.room.name}</h1>
            {!data.isMember && (
              <Badge variant="secondary">
                <Globe className="w-3 h-3 mr-1" />
                只读
              </Badge>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <Users className="w-4 h-4" />
            <span>{members.length}</span>
            <Button asChild size="sm" variant="outline">
              <Link href={data.currentUserId ? "/dashboard/" : "/auth/login/"}>
                {data.currentUserId ? "Dashboard" : "登录"}
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <p className="px-4 py-1 text-xs text-muted-foreground">
          日历以设备时区显示（{Intl.DateTimeFormat().resolvedOptions().timeZone}
          ）；课程按各课表时区换算。
        </p>
        <RoomCalendar
          memberData={members}
          holidays={data.holidays}
          roomId={id!}
          roomName={data.room.name}
          currentUserId={data.currentUserId}
          isReadOnly={!data.isMember}
        />
      </main>
    </div>
  );
}
