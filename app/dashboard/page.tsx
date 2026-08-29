import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { DoorOpen, Calendar, Mail, ArrowRight } from "lucide-react";

export default async function DashboardPage() {
    const supabase = await createClient();
    const { user, profile } = await getCurrentUserProfile();
    if (!user) redirect("/auth/login");

    const [
        { count: roomCount },
        { count: scheduleCount },
        { count: invitationCount },
    ] = await Promise.all([
        supabase.from("rooms").select("*", { count: "exact", head: true }).eq("admin_id", user.id),
        supabase.from("schedules").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("invitations").select("*", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
    ]);

    const { data: memberRooms } = await supabase
        .from("room_members")
        .select("room:rooms(id, name, is_public, created_at)")
        .eq("user_id", user.id)
        .limit(5);

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">
                    你好，{profile?.display_name ?? "同学"}
                </h1>
                {profile?.role === "superadmin" && (
                    <Badge className="mt-1" variant="secondary">网站管理员</Badge>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard
                    icon={<DoorOpen className="w-5 h-5" />}
                    label="我创建的 Room"
                    value={`${roomCount ?? 0} / ${profile?.room_quota ?? 3}`}
                    href="/dashboard/rooms"
                />
                <StatCard
                    icon={<Calendar className="w-5 h-5" />}
                    label="已导入课表"
                    value={String(scheduleCount ?? 0)}
                    href="/dashboard/profile"
                />
                <StatCard
                    icon={<Mail className="w-5 h-5" />}
                    label="待处理邀请"
                    value={String(invitationCount ?? 0)}
                    href="/dashboard/invitations"
                    highlight={(invitationCount ?? 0) > 0}
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">我加入的 Room</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {(memberRooms?.length ?? 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">还没有加入任何 Room。先创建一个或等待他人邀请。</p>
                    ) : (
                        memberRooms?.map((mr) => {
                            const rawRoom = Array.isArray(mr.room) ? mr.room[0] : mr.room;
                            const room = rawRoom as { id: string; name: string; is_public: boolean } | null;
                            if (!room) return null;
                            return (
                                <Link
                                    key={room.id}
                                    href={`/room/${room.id}`}
                                    className="flex items-center justify-between p-3 rounded-lg border border-border/60 hover:bg-muted transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{room.name}</span>
                                        {room.is_public && <Badge variant="outline" className="text-xs">公开</Badge>}
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                </Link>
                            );
                        })
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    href,
    highlight,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    href: string;
    highlight?: boolean;
}) {
    return (
        <Link href={href}>
            <Card className={`hover:border-border transition-colors ${highlight ? "border-primary/50" : ""}`}>
                <CardContent className="pt-5 pb-4">
                    <div className={`mb-2 ${highlight ? "text-primary" : "text-muted-foreground"}`}>{icon}</div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </CardContent>
            </Card>
        </Link>
    );
}
