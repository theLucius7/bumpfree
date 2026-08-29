import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { InvitationCard } from "@/components/dashboard/InvitationCard";
import { Mail } from "lucide-react";

export default async function InvitationsPage() {
    const supabase = await createClient();
    const { user } = await getCurrentUserProfile();
    if (!user) redirect("/auth/login");

    const { data: invitations } = await supabase
        .from("invitations")
        .select("*, room:rooms(id, name, description), inviter:profiles!invitations_inviter_id_fkey(id, display_name)")
        .eq("invitee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">邀请通知</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    待处理的 Room 加入邀请
                </p>
            </div>

            {(invitations?.length ?? 0) === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                    <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>暂无待处理邀请</p>
                    <p className="text-sm mt-1">当有人邀请你加入 Room 时，会在这里显示</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {invitations?.map((inv) => (
                        <InvitationCard key={inv.id} invitation={inv} />
                    ))}
                </div>
            )}
        </div>
    );
}
