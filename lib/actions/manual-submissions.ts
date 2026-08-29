"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const statusSchema = z.enum(["pending", "processing", "done", "rejected"]);

export interface ManualScheduleSubmission {
    id: string;
    user_id: string;
    status: "pending" | "processing" | "done" | "rejected";
    text_content: string | null;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    admin_note: string | null;
    created_at: string;
    updated_at: string;
    profile?: {
        display_name: string | null;
    } | null;
}

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

    if (profile?.role !== "superadmin") throw new Error("Forbidden");
    return supabase;
}

export async function getManualScheduleSubmissions() {
    const supabase = await assertSuperAdmin();
    const { data, error } = await supabase
        .from("manual_schedule_submissions")
        .select("id,user_id,status,text_content,file_name,file_type,file_size,admin_note,created_at,updated_at,profile:profiles(display_name)")
        .in("status", ["pending", "processing"])
        .order("created_at", { ascending: false })
        .limit(25);

    if (error) return [];
    return (data ?? []).map((item) => {
        const relatedProfile = Array.isArray(item.profile) ? item.profile[0] : item.profile;
        return {
            id: String(item.id),
            user_id: String(item.user_id),
            status: item.status as ManualScheduleSubmission["status"],
            text_content: item.text_content as string | null,
            file_name: item.file_name as string | null,
            file_type: item.file_type as string | null,
            file_size: item.file_size as number | null,
            admin_note: item.admin_note as string | null,
            created_at: String(item.created_at),
            updated_at: String(item.updated_at),
            profile: relatedProfile ? { display_name: relatedProfile.display_name as string | null } : null,
        } satisfies ManualScheduleSubmission;
    });
}

export async function updateManualScheduleSubmission(formData: FormData) {
    const id = z.string().uuid().safeParse(formData.get("id"));
    const status = statusSchema.safeParse(formData.get("status"));
    const adminNote = z.string().trim().max(2_000).safeParse(formData.get("adminNote") ?? "");
    if (!id.success || !status.success || !adminNote.success) return { error: "请检查处理状态和备注" };

    const supabase = await assertSuperAdmin();
    const { data: updated, error } = await supabase
        .from("manual_schedule_submissions")
        .update({
            status: status.data,
            admin_note: adminNote.data || null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", id.data)
        .select("id")
        .maybeSingle();

    if (error || !updated) return { error: error ? `更新失败：${error.message}` : "提交不存在" };
    revalidatePath("/admin/settings");
    return { success: true };
}
