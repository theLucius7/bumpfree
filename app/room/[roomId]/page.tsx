import { createClient } from "@/lib/supabase/server";
import { getMalaysiaPublicHolidays } from "@/lib/utils/holidays";
import { notFound, redirect } from "next/navigation";
import { RoomCalendar } from "@/components/calendar/RoomCalendar";
import { Badge } from "@/components/ui/badge";
import { Lock, Globe, Users, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDisplayMemberColor } from "@/lib/utils/colors";
import type { BusyBlock, Course, Schedule } from "@/lib/types";

interface RoomPageProps { params: Promise<{ roomId: string }>; }

type ActiveSchedule = Pick<Schedule, "id" | "user_id" | "semester_tag" | "start_date" | "max_weeks" | "school">;
type RoomCalendarCourse = Omit<Course, "schedule_id" | "user_id" | "created_at">;
type RoomCalendarBusyBlock = Omit<BusyBlock, "user_id" | "created_at">;
type RoomCalendarMember = {
    user_id: string;
    display_name: string | null;
    color: string;
    joined_at: string;
    schedule: (ActiveSchedule & {
        imported_at: string;
        courses: RoomCalendarCourse[];
    }) | null;
    busy_blocks: RoomCalendarBusyBlock[];
};
type RoomCalendarPayload = {
    room: {
        id: string;
        name: string;
        description: string | null;
        is_public: boolean;
        expires_at: string | null;
    };
    members: RoomCalendarMember[];
};

export default async function RoomPage({ params }: RoomPageProps) {
    const { roomId } = await params;
    if (!isUuid(roomId)) notFound();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase.rpc("get_room_calendar", { p_room_id: roomId });
    if (error) {
        if (error.code !== "42501") throw new Error(`Unable to load room calendar (${error.code})`);
        if (!user) redirect("/auth/login");
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
                <div className="text-center max-w-sm">
                    <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h1 className="text-xl font-semibold mb-2">{ "\u65e0\u8bbf\u95ee\u6743\u9650" }</h1>
                    <p className="text-muted-foreground text-sm mb-6">{ "\u4f60\u9700\u8981\u662f\u8be5 Room \u7684\u6210\u5458\u624d\u80fd\u67e5\u770b\u65e5\u5386\u3002\u8bf7\u8054\u7cfb Room \u7ba1\u7406\u5458\u83b7\u53d6\u9080\u8bf7\u3002" }</p>
                    <Link href="/dashboard"><Button variant="outline">{ "\u8fd4\u56de Dashboard" }</Button></Link>
                </div>
            </div>
        );
    }
    if (!isRoomCalendarPayload(data)) throw new Error("Room calendar returned an invalid payload");
    const { room, members } = data;
    const isMember = Boolean(user && members.some((member) => member.user_id === user.id));

    const usedDisplayColors: string[] = [];
    const memberData = members.map((member) => {
        const displayColor = getDisplayMemberColor(member.user_id, member.color, usedDisplayColors);
        usedDisplayColors.push(displayColor);
        const schedule = member.schedule;
        return {
            userId: member.user_id,
            displayName: member.display_name ?? "\u672a\u77e5\u7528\u6237",
            color: displayColor,
            schedule,
            courses: schedule ? schedule.courses.map((course) => ({
                ...course,
                schedule_id: schedule.id,
                user_id: member.user_id,
                created_at: "",
            })) : [],
            busyBlocks: member.busy_blocks.map((block) => ({
                ...block,
                user_id: member.user_id,
                created_at: "",
            })),
        };
    });

    const years = memberData.flatMap((member) => {
        if (!member.schedule || member.schedule.max_weeks < 1 || member.schedule.max_weeks > 30) return [];
        const start = parseIsoDate(member.schedule.start_date);
        if (!start) return [];
        const end = new Date(start);
        end.setDate(end.getDate() + member.schedule.max_weeks * 7);
        return [start.getFullYear(), end.getFullYear()];
    });
    const usesMalaysiaCalendar = memberData.some((member) => isMalaysiaCampus(member.schedule?.school));
    const holidays = usesMalaysiaCalendar
        ? await getMalaysiaPublicHolidays([new Date().getFullYear(), ...years])
        : [];

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b border-border/60 sticky top-0 z-40 bg-background/80 backdrop-blur">
                <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Link href="/" className="flex items-center gap-1.5 flex-shrink-0"><Zap className="w-4 h-4 text-primary" /><span className="font-semibold text-sm hidden sm:block">BumpFree</span></Link>
                        <span className="text-border">/</span><h1 className="font-semibold text-sm truncate">{room.name}</h1>
                        {room.is_public && !isMember && <Badge variant="secondary" className="text-xs gap-1 flex-shrink-0"><Globe className="w-3 h-3" />{"\u53ea\u8bfb"}</Badge>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="w-4 h-4" /><span>{memberData.length}</span></div>
                        <div className="flex -space-x-1">{memberData.slice(0, 5).map((m) => <div key={m.userId} className="w-6 h-6 rounded-full border-2 border-background" style={{ backgroundColor: m.color }} title={m.displayName} />)}</div>
                        {user ? <Link href="/dashboard"><Button variant="outline" size="sm">Dashboard</Button></Link> : <Link href="/auth/login"><Button variant="outline" size="sm">{"\u767b\u5f55"}</Button></Link>}
                    </div>
                </div>
            </header>
            <main className="flex-1 overflow-hidden">
                <RoomCalendar memberData={memberData} holidays={holidays} roomId={roomId} roomName={room.name} currentUserId={user?.id ?? null} isReadOnly={!isMember} />
            </main>
        </div>
    );
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRoomCalendarPayload(value: unknown): value is RoomCalendarPayload {
    if (!isRecord(value) || !isRecord(value.room) || !Array.isArray(value.members)) return false;
    const room = value.room;
    if (!isUuidValue(room.id) || typeof room.name !== "string" || typeof room.is_public !== "boolean"
        || !isNullableString(room.description) || !isNullableString(room.expires_at)) return false;

    return value.members.every((member) => {
        if (!isRecord(member) || !isUuidValue(member.user_id) || typeof member.color !== "string"
            || typeof member.joined_at !== "string" || !isNullableString(member.display_name)
            || !Array.isArray(member.busy_blocks)) return false;
        if (!member.busy_blocks.every(isRoomCalendarBusyBlock)) return false;
        if (member.schedule === null) return true;
        if (!isRecord(member.schedule) || !isUuidValue(member.schedule.id)
            || member.schedule.user_id !== member.user_id
            || typeof member.schedule.semester_tag !== "string"
            || !isNullableString(member.schedule.school)
            || typeof member.schedule.start_date !== "string"
            || !Number.isInteger(member.schedule.max_weeks)
            || typeof member.schedule.imported_at !== "string"
            || !Array.isArray(member.schedule.courses)) return false;
        return member.schedule.courses.every(isRoomCalendarCourse);
    });
}

function isRoomCalendarCourse(value: unknown): value is RoomCalendarCourse {
    return isRecord(value)
        && isUuidValue(value.id)
        && typeof value.name === "string"
        && isNullableString(value.room)
        && isNullableString(value.teacher)
        && Number.isInteger(value.day_of_week)
        && typeof value.start_time === "string"
        && typeof value.end_time === "string"
        && Number.isInteger(value.start_week)
        && Number.isInteger(value.end_week)
        && isNullableString(value.color);
}

function isRoomCalendarBusyBlock(value: unknown): value is RoomCalendarBusyBlock {
    return isRecord(value)
        && isUuidValue(value.id)
        && typeof value.title === "string"
        && typeof value.starts_at === "string"
        && typeof value.ends_at === "string"
        && isNullableString(value.note)
        && (value.source === "manual" || value.source === "reschedule");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === "string";
}

function isUuidValue(value: unknown): value is string {
    return typeof value === "string" && isUuid(value);
}

function parseIsoDate(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (year < 2000 || year > 2100 || date.getFullYear() !== year
        || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

function isMalaysiaCampus(school: string | null | undefined): boolean {
    if (!school) return false;
    const normalized = school.normalize("NFKC").toLowerCase();
    return normalized.includes("xmum")
        || normalized.includes("malaysia")
        || normalized.includes("马来西亚")
        || normalized.includes("厦马");
}
