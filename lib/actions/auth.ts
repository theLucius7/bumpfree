"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthCallbackUrl } from "@/lib/auth/site-url";
import { redirect } from "next/navigation";
import { z } from "zod";

const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(6).max(128),
});

const registerSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
    displayName: z.string().trim().min(1).max(50),
});

type AuthErrorLike = {
    message?: string;
    status?: number;
    code?: string;
};

function authErrorMessage(error: AuthErrorLike | null): string {
    const message = error?.message ?? "";
    const normalized = message.toLowerCase();

    if (error?.status === 429 || normalized.includes("rate limit")) {
        return "请求过于频繁，请稍候几分钟再试。";
    }

    if (normalized.includes("already registered") || normalized.includes("user already registered")) {
        return "\u8be5\u90ae\u7bb1\u5df2\u6ce8\u518c\uff0c\u8bf7\u76f4\u63a5\u767b\u5f55\u6216\u627e\u56de\u5bc6\u7801\u3002";
    }

    if (normalized.includes("invalid login credentials")) {
        return "\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef\u3002";
    }

    if (normalized.includes("email not confirmed")) {
        return "邮箱尚未验证，请先通过验证邮件完成确认。";
    }

    return "\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002";
}

export async function loginAction(formData: FormData) {
    const parsed = loginSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    });
    if (!parsed.success) return { error: "\u8bf7\u586b\u5199\u6709\u6548\u7684\u90ae\u7bb1\u548c\u5bc6\u7801\uff08\u81f3\u5c11 6 \u4f4d\uff09\u3002" };

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: authErrorMessage(error) };

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

        if (!existingProfile) {
            const displayName =
                (user.user_metadata?.display_name as string | undefined) ||
                (user.email ? user.email.split("@")[0] : null);
            await supabase.from("profiles").insert({ id: user.id, display_name: displayName });
        }
    }

    redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
    const parsed = registerSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
        displayName: formData.get("displayName"),
    });
    if (!parsed.success) return { error: "\u8bf7\u68c0\u67e5\u6635\u79f0\u3001\u90ae\u7bb1\u548c\u5bc6\u7801\u683c\u5f0f\u3002" };

    const emailRedirectTo = getAuthCallbackUrl();
    if (!emailRedirectTo) return { error: "\u7f51\u7ad9\u5730\u5740\u672a\u914d\u7f6e\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u3002" };

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
            data: {
                display_name: parsed.data.displayName,
            },
            emailRedirectTo,
        },
    });
    if (error) return { error: authErrorMessage(error) };
    if (!data.user) return { error: "\u6ce8\u518c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002" };

    if (data.session) {
        await supabase
            .from("profiles")
            .update({ display_name: parsed.data.displayName })
            .eq("id", data.user.id);
    }

    if (!data.session) {
        return { success: true, message: "注册成功。请检查邮箱并完成验证，然后返回登录。" };
    }

    redirect("/dashboard");
}

export async function logoutAction() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
}

export async function requestPasswordResetAction(formData: FormData) {
    const email = z.string().trim().toLowerCase().email().max(254).safeParse(formData.get("email"));
    if (!email.success) return { error: "\u8bf7\u8f93\u5165\u6709\u6548\u7684\u90ae\u7bb1\u3002" };

    const redirectTo = getAuthCallbackUrl("/auth/update-password");
    if (!redirectTo) return { error: "\u7f51\u7ad9\u5730\u5740\u672a\u914d\u7f6e\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u3002" };

    const supabase = await createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
        redirectTo,
    });

    if (error) return { error: authErrorMessage(error) };

    return { success: true, message: "\u5bc6\u7801\u91cd\u7f6e\u90ae\u4ef6\u5df2\u53d1\u9001\uff0c\u8bf7\u68c0\u67e5\u6536\u4ef6\u7bb1\u3002" };
}

export async function updatePasswordFromRecoveryAction(formData: FormData) {
    const password = z.string().min(8).max(128).safeParse(formData.get("password"));
    if (!password.success) return { error: "密码需要 8 至 128 位。" };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: password.data });

    if (error) return { error: authErrorMessage(error) };

    redirect("/dashboard");
}

export async function getCurrentUser() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    return profile;
}
