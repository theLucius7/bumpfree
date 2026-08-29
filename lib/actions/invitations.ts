"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const invitationIdSchema = z.string().uuid();

export async function getMyInvitations() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
        .from("invitations")
        .select(
            "*, room:rooms(id, name, description), inviter:profiles!invitations_inviter_id_fkey(id, display_name)"
        )
        .eq("invitee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    return data ?? [];
}

export async function acceptInvitation(invitationId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };
    const parsedId = invitationIdSchema.safeParse(invitationId);
    if (!parsedId.success) return { error: "邀请参数不合法" };

    const { data: roomId, error } = await supabase.rpc("accept_room_invitation", {
        p_invitation_id: parsedId.data,
    });
    if (error || typeof roomId !== "string") return { error: "邀请不存在、已处理或 Room 已失效" };

    revalidatePath("/dashboard/invitations");
    revalidatePath(`/room/${roomId}`);
    return { success: true, roomId };
}

export async function declineInvitation(invitationId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "请先登录" };
    const parsedId = invitationIdSchema.safeParse(invitationId);
    if (!parsedId.success) return { error: "邀请参数不合法" };

    const { data: declined, error } = await supabase
        .from("invitations")
        .update({ status: "declined" })
        .eq("id", parsedId.data)
        .eq("invitee_id", user.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

    if (error || !declined) return { error: "邀请不存在或已处理" };
    revalidatePath("/dashboard/invitations");
    return { success: true };
}
