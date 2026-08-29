import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { CreateRoomDialog } from "@/components/dashboard/CreateRoomDialog";
import { RoomManageCard } from "@/components/dashboard/RoomManageCard";
import { DoorOpen } from "lucide-react";

export default async function RoomsPage() {
    const supabase = await createClient();
    const { user, profile } = await getCurrentUserProfile();
    if (!user) redirect("/auth/login");

    const { data: rooms } = await supabase
        .from("rooms")
        .select("*, room_members(count)")
        .eq("admin_id", user.id)
        .order("created_at", { ascending: false });

    const quota = profile?.room_quota ?? 3;
    const roomCount = rooms?.length ?? 0;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold">我的 Room</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        已创建 {roomCount} / {quota} 个 Room
                    </p>
                </div>
                <CreateRoomDialog />
            </div>

            {roomCount === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                    <DoorOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>还没有创建任何 Room</p>
                    <p className="text-sm mt-1">创建 Room，邀请成员，一键查找共同空闲时间</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {rooms?.map((room) => (
                        <RoomManageCard key={room.id} room={room} />
                    ))}
                </div>
            )}
        </div>
    );
}
