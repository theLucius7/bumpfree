"use server";

import { createClient } from "@/lib/supabase/server";
import { MEMBER_COLORS } from "@/lib/utils/colors";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const offsetDateTimeSchema = z.string().datetime({ offset: true });

const createRoomSchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    expiresAt: z.union([z.literal(""), offsetDateTimeSchema]).optional(),
});

const updateRoomSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    expiresAt: z.union([z.literal(""), offsetDateTimeSchema]).nullable().optional(),
    isPublic: z.boolean().optional(),
});

const uuidSchema = z.string().uuid();

function normalizeOptionalDate(value: string | null | undefined) {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return undefined;
    if (date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) return undefined;
    return date.toISOString();
}

async function ensureCurrentUserProfile() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { supabase, user: null };

    const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

    if (!existingProfile) {
        const displayName =
            (user.user_metadata?.display_name as string | undefined) ||
            (user.email ? user.email.split("@")[0] : null);

        await supabase.from("profiles").upsert({
            id: user.id,
            display_name: displayName,
        });
    }

    return { supabase, user };
}

export async function createRoom(formData: FormData) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };

    const { data: profile } = await supabase
        .from("profiles")
        .select("room_quota")
        .eq("id", user.id)
        .single();

    const { count: currentRooms } = await supabase
        .from("rooms")
        .select("*", { count: "exact", head: true })
        .eq("admin_id", user.id);

    if (profile && currentRooms !== null && currentRooms >= profile.room_quota) {
        return { error: `已达到 Room 创建上限（${profile.room_quota} 个）` };
    }

    const parsed = createRoomSchema.safeParse({
        name: formData.get("name"),
        description: formData.get("description"),
        expiresAt: formData.get("expiresAt"),
    });
    if (!parsed.success) return { error: "请填写 Room 名称" };

    const expiresAt = normalizeOptionalDate(parsed.data.expiresAt);
    if (expiresAt === undefined) return { error: "过期时间格式不合法" };

    const { data: room, error } = await supabase
        .from("rooms")
        .insert({
            admin_id: user.id,
            name: parsed.data.name,
            description: parsed.data.description || null,
            expires_at: expiresAt,
        })
        .select()
        .single();

    if (error || !room) {
        console.error("[createRoom] Error:", error);
        return { error: "创建 Room 失败，请检查额度或稍后重试" };
    }

    const { error: joinError } = await supabase.from("room_members").insert({
        room_id: room.id,
        user_id: user.id,
        color: MEMBER_COLORS[0],
    });

    if (joinError) {
        console.error("[createRoom] join error:", joinError);
        await supabase.from("rooms").delete().eq("id", room.id).eq("admin_id", user.id);
        return { error: "创建 Room 失败，请稍后重试" };
    }

    revalidatePath("/dashboard/rooms");
    return { success: true, roomId: room.id };
}

export async function updateRoom(
    roomId: string,
    updates: { name?: string; description?: string | null; expiresAt?: string | null; isPublic?: boolean }
) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };
    if (!uuidSchema.safeParse(roomId).success) return { error: "Room 参数不合法" };

    const parsed = updateRoomSchema.safeParse(updates);

    if (!parsed.success) return { error: "参数不合法" };

    const payload: {
        name?: string;
        description?: string | null;
        expires_at?: string | null;
        is_public?: boolean;
    } = {};

    if (parsed.data.name !== undefined) payload.name = parsed.data.name;
    if (parsed.data.description !== undefined) payload.description = parsed.data.description || null;
    if (parsed.data.expiresAt !== undefined) {
        const expiresAt = normalizeOptionalDate(parsed.data.expiresAt);
        if (expiresAt === undefined) return { error: "过期时间格式不合法" };
        payload.expires_at = expiresAt;
    }
    if (parsed.data.isPublic !== undefined) payload.is_public = parsed.data.isPublic;
    if (Object.keys(payload).length === 0) return { error: "没有可更新的字段" };

    const { data: updated, error } = await supabase
        .from("rooms")
        .update(payload)
        .eq("id", roomId)
        .eq("admin_id", user.id)
        .select("id")
        .maybeSingle();

    if (error || !updated) return { error: "Room 不存在或你没有管理权限" };
    revalidatePath(`/room/${roomId}`);
    revalidatePath("/dashboard/rooms");
    return { success: true };
}

export async function deleteRoom(roomId: string) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };
    if (!uuidSchema.safeParse(roomId).success) return { error: "Room 参数不合法" };

    const { data: deleted, error } = await supabase
        .from("rooms")
        .delete()
        .eq("id", roomId)
        .eq("admin_id", user.id)
        .select("id")
        .maybeSingle();

    if (error || !deleted) return { error: "Room 不存在或你没有管理权限" };
    revalidatePath("/dashboard/rooms");
    return { success: true };
}

export async function getMyRooms() {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return [];

    const { data } = await supabase
        .from("rooms")
        .select("*, room_members(count)")
        .eq("admin_id", user.id)
        .order("created_at", { ascending: false });

    return data ?? [];
}

export async function searchUsers(query: string) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return [];

    const normalizedQuery = query.trim().replace(/[%_\\]/g, "");
    if (normalizedQuery.length < 2 || normalizedQuery.length > 50) return [];

    const { data, error } = await supabase.rpc("search_profiles", {
        p_query: normalizedQuery,
    });
    if (error) return [];

    return (data ?? []).map((profile: { id: string; display_name: string | null }) => ({
        ...profile,
        display_name: profile.display_name || "未命名用户",
    }));
}

export async function inviteUserToRoom(roomId: string, inviteeId: string) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };
    if (!uuidSchema.safeParse(roomId).success || !uuidSchema.safeParse(inviteeId).success) {
        return { error: "邀请参数不合法" };
    }
    if (inviteeId === user.id) return { error: "你已经是 Room 成员" };

    const { data: room } = await supabase
        .from("rooms")
        .select("admin_id")
        .eq("id", roomId)
        .maybeSingle();

    if (!room || room.admin_id !== user.id) return { error: "只有 Room 管理员可以邀请成员" };

    const { data: existing } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", roomId)
        .eq("user_id", inviteeId)
        .maybeSingle();

    if (existing) return { error: "该用户已是 Room 成员" };

    const { data: pendingInv } = await supabase
        .from("invitations")
        .select("id")
        .eq("room_id", roomId)
        .eq("invitee_id", inviteeId)
        .eq("status", "pending")
        .maybeSingle();

    if (pendingInv) return { error: "已发送过邀请，等待对方回应" };

    const { error } = await supabase.from("invitations").insert({
        room_id: roomId,
        invitee_id: inviteeId,
        inviter_id: user.id,
        status: "pending",
    });

    if (error) return { error: "发送邀请失败" };
    revalidatePath("/dashboard/invitations");
    return { success: true };
}

export async function getRoomMembers(roomId: string) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user || !uuidSchema.safeParse(roomId).success) return [];

    const { data } = await supabase
        .from("room_members")
        .select("*, profile:profiles(id, display_name, role)")
        .eq("room_id", roomId);

    return data ?? [];
}

export async function removeRoomMember(roomId: string, userId: string) {
    const { supabase, user } = await ensureCurrentUserProfile();
    if (!user) return { error: "请先登录" };
    if (!uuidSchema.safeParse(roomId).success || !uuidSchema.safeParse(userId).success) {
        return { error: "成员参数不合法" };
    }

    const { data: room } = await supabase
        .from("rooms")
        .select("admin_id")
        .eq("id", roomId)
        .single();

    if (!room || room.admin_id !== user.id) return { error: "权限不足" };
    if (userId === room.admin_id) return { error: "无法移除 Room 管理员" };

    const { data: removed, error } = await supabase
        .from("room_members")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .select("user_id")
        .maybeSingle();

    if (error || !removed) return { error: "成员不存在或已被移除" };
    revalidatePath(`/room/${roomId}`);
    return { success: true };
}
