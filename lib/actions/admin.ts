"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminUser, Profile } from "@/lib/types";
import { getAuthCallbackUrl } from "@/lib/auth/site-url";

const updateQuotaSchema = z.object({
    userId: z.string().uuid(),
    roomQuota: z.coerce.number().int().min(0).max(100),
});

const updateUserScheduleQuotaSchema = z.object({
    userId: z.string().uuid(),
    scheduleQuota: z.coerce.number().int().min(0).max(100),
});

const bulkInviteUsersSchema = z.object({
    lines: z.string().trim().min(1).max(20_000),
});

const userIdSchema = z.string().uuid();
const emailSchema = z.string().trim().email().max(254);
const displayNameSchema = z.string().trim().min(1).max(50);

async function assertSuperAdmin() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (!profile || profile.role !== "superadmin") throw new Error("Forbidden");
    return supabase;
}

function normalizeDisplayName(
    profileDisplayName: string | null | undefined,
    email: string | null | undefined,
    metadataDisplayName: unknown
) {
    const profileName = profileDisplayName?.trim();
    const emailLocalPart = email?.split("@")[0];
    const isNumericEmailFallback =
        typeof profileName === "string" &&
        typeof emailLocalPart === "string" &&
        profileName === emailLocalPart &&
        /^\d+$/.test(profileName);

    if (profileName && !isNumericEmailFallback) return profileName;
    if (typeof metadataDisplayName === "string" && metadataDisplayName.trim()) return metadataDisplayName.trim();
    if (email) return email;
    if (profileName) return profileName;
    return "\u672a\u547d\u540d\u7528\u6237";
}

function profileToAdminUser(profile: Profile): AdminUser {
    return {
        id: profile.id,
        display_name: normalizeDisplayName(profile.display_name, null, null),
        email: null,
        role: profile.role,
        room_quota: profile.room_quota,
        schedule_quota: profile.schedule_quota ?? 3,
        created_at: profile.created_at,
    };
}

export async function getAllUsers() {
    const supabase = await assertSuperAdmin();
    const adminClient = createAdminClient();

    const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

    const profiles = (data ?? []) as Profile[];

    if (!adminClient) {
        return profiles.map(profileToAdminUser);
    }

    const allUsers = [];
    let page = 1;

    while (true) {
        const { data: authData, error } = await adminClient.auth.admin.listUsers({
            page,
            perPage: 1000,
        });

        if (error) {
            throw new Error(`\u83b7\u53d6\u7ba1\u7406\u5458\u4fe1\u606f\u5931\u8d25\uff1a${error.message}`);
        }

        const users = authData.users ?? [];
        allUsers.push(...users);

        if (users.length < 1000) break;
        page += 1;
    }

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

    return allUsers
        .map((authUser) => {
            const profile = profileMap.get(authUser.id);

            return {
                id: authUser.id,
                display_name: normalizeDisplayName(
                    profile?.display_name,
                    authUser.email,
                    authUser.user_metadata?.display_name
                ),
                email: authUser.email ?? null,
                role: profile?.role ?? "user",
                room_quota: profile?.room_quota ?? 3,
                schedule_quota: profile?.schedule_quota ?? 3,
                created_at: profile?.created_at ?? authUser.created_at,
            } satisfies AdminUser;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function updateUserQuota(formData: FormData) {
    const parsed = updateQuotaSchema.safeParse({
        userId: formData.get("userId"),
        roomQuota: formData.get("roomQuota"),
    });

    if (!parsed.success) return { error: "参数不合法" };

    const supabase = await assertSuperAdmin();
    const { data: updated, error } = await supabase
        .from("profiles")
        .update({ room_quota: parsed.data.roomQuota })
        .eq("id", parsed.data.userId)
        .select("id")
        .maybeSingle();

    if (error || !updated) return { error: "用户不存在或 Room 额度更新失败" };

    revalidatePath("/admin/users");
    return { success: true };
}

export async function updateUserScheduleQuota(formData: FormData) {
    const parsed = updateUserScheduleQuotaSchema.safeParse({
        userId: formData.get("userId"),
        scheduleQuota: formData.get("scheduleQuota"),
    });

    if (!parsed.success) return { error: "参数不合法" };

    const supabase = await assertSuperAdmin();
    const { data: updated, error } = await supabase
        .from("profiles")
        .update({ schedule_quota: parsed.data.scheduleQuota })
        .eq("id", parsed.data.userId)
        .select("id")
        .maybeSingle();

    if (error || !updated) return { error: "用户不存在或课表额度更新失败" };

    revalidatePath("/admin/users");
    return { success: true };
}

export async function toggleUserRole(userId: string) {
    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) return { error: "参数不合法" };

    const supabase = await assertSuperAdmin();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id === parsedUserId.data) return { error: "不能修改自己的管理员角色" };

    const { data: target } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", parsedUserId.data)
        .maybeSingle();
    if (!target) return { error: "用户不存在" };

    if (target.role === "superadmin") {
        const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "superadmin");
        if ((count ?? 0) <= 1) return { error: "必须保留至少一名管理员" };
    }

    const newRole = target.role === "superadmin" ? "user" : "superadmin";

    const { data: updated, error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", parsedUserId.data)
        .eq("role", target.role)
        .select("id")
        .maybeSingle();

    if (error || !updated) return { error: "角色已变化，请刷新后重试" };
    revalidatePath("/admin/users");
    return { success: true };
}

function expandTemplate(value: string, index: number, isEmail: boolean) {
    if (value.includes("{n}")) {
        return value.replaceAll("{n}", String(index));
    }

    if (!isEmail) {
        return `${value}${index}`;
    }

    const atIndex = value.lastIndexOf("@");
    if (atIndex === -1) return `${value}${index}`;
    return `${value.slice(0, atIndex)}${index}${value.slice(atIndex)}`;
}

export async function bulkInviteUsers(formData: FormData) {
    const parsed = bulkInviteUsersSchema.safeParse({
        lines: formData.get("lines"),
    });

    if (!parsed.success) return { error: "请填写有效的邀请列表" };

    await assertSuperAdmin();
    const adminClient = createAdminClient();
    if (!adminClient) return { error: "缺少 Supabase 管理员配置，无法发送邀请" };

    const redirectTo = getAuthCallbackUrl("/auth/update-password");
    if (!redirectTo) return { error: "网站地址未配置，无法生成安全的邀请链接" };

    const rawLines = parsed.data.lines
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const entries: Array<{ email: string; displayName: string }> = [];

    for (const line of rawLines) {
        const parts = line.split(",").map((part) => part.trim());
        if (parts.length < 2 || parts.length > 3) {
            return { error: `格式错误：${line}` };
        }

        const [emailTemplate, displayNameTemplate, quantityRaw] = parts;
        const quantity = quantityRaw ? Number(quantityRaw) : 1;

        if (!emailTemplate || !displayNameTemplate) {
            return { error: `格式错误：${line}` };
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
            return { error: `数量不合法：${line}` };
        }

        if (quantity === 1) {
            entries.push({
                email: emailTemplate,
                displayName: displayNameTemplate,
            });
        } else {
            for (let i = 1; i <= quantity; i += 1) {
                entries.push({
                    email: expandTemplate(emailTemplate, i, true),
                    displayName: expandTemplate(displayNameTemplate, i, false),
                });
            }
        }

        if (entries.length > 100) return { error: "单次最多邀请 100 个用户" };
    }

    const normalizedEntries: Array<{ email: string; displayName: string }> = [];
    const seenEmails = new Set<string>();
    for (const entry of entries) {
        const email = emailSchema.safeParse(entry.email.toLowerCase());
        const displayName = displayNameSchema.safeParse(entry.displayName);
        if (!email.success || !displayName.success) return { error: `邮箱或昵称不合法：${entry.email}` };
        if (seenEmails.has(email.data)) return { error: `邀请列表包含重复邮箱：${email.data}` };
        seenEmails.add(email.data);
        normalizedEntries.push({ email: email.data, displayName: displayName.data });
    }

    const invited: string[] = [];
    const failed: string[] = [];

    for (const entry of normalizedEntries) {
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(entry.email, {
            data: {
                display_name: entry.displayName,
            },
            redirectTo,
        });

        if (error || !data.user) {
            failed.push(`${entry.email}: ${error?.message || "邀请失败"}`);
            continue;
        }
        invited.push(entry.email);
    }

    revalidatePath("/admin/users");

    if (invited.length === 0) {
        return { error: failed[0] || "没有成功发送任何邀请" };
    }

    return {
        success: true,
        invitedCount: invited.length,
        failed,
    };
}

export async function getGlobalStats() {
    const supabase = await assertSuperAdmin();
    const [{ count: userCount }, { count: roomCount }] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("rooms").select("id", { count: "exact", head: true }),
    ]);

    return { userCount: userCount ?? 0, roomCount: roomCount ?? 0 };
}
