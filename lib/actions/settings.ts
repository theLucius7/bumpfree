"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const profileSettingsSchema = z.object({
    displayName: z.string().trim().min(1).max(50),
});

const authSettingsSchema = z.object({
    email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(254)]),
    password: z.union([z.literal(""), z.string().min(8).max(128)]),
});

export async function updateProfileAction(formData: FormData) {
    const parsed = profileSettingsSchema.safeParse({ displayName: formData.get("displayName") });
    if (!parsed.success) return { error: "昵称需要 1 至 50 个字符" };

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "未登录" };

    const { data: updated, error } = await supabase
        .from("profiles")
        .update({ display_name: parsed.data.displayName })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

    if (error || !updated) return { error: "保存失败，请稍后重试" };

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { success: true };
}

export async function updateAuthAction(formData: FormData) {
    const parsed = authSettingsSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    });
    if (!parsed.success) return { error: "请填写有效邮箱；新密码需要 8 至 128 位" };

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "未登录" };

    const updates: { email?: string; password?: string } = {};
    if (parsed.data.email && parsed.data.email !== user.email?.toLowerCase()) updates.email = parsed.data.email;
    if (parsed.data.password) updates.password = parsed.data.password;
    if (Object.keys(updates).length === 0) return { error: "没有需要更新的信息" };

    const { error } = await supabase.auth.updateUser(updates);

    if (error) return { error: error.status === 429 ? "请求过于频繁，请稍后重试" : "更新失败，请检查邮箱或稍后重试" };

    revalidatePath("/dashboard/settings");
    const message = updates.email && updates.password
        ? "邮箱确认邮件已发送，密码已更新"
        : updates.email ? "邮箱确认邮件已发送，请查收" : "密码已更新";
    return { success: true, message };
}
