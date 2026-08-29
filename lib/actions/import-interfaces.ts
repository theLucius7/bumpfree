"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
    DEFAULT_IMPORT_INTERFACES,
    getEnabledImportInterfaces,
    normalizeImportInterfaces,
    type ImportInterfaceCategory,
    type ImportInterfaceConfig,
} from "@/lib/utils/importInterfaces";

const updateImportInterfaceSchema = z.object({
    id: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
    enabled: z.coerce.boolean(),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    sortOrder: z.coerce.number().int().min(0).max(1000),
});
const customInterfaceIdSchema = z.string().min(8).max(80).regex(/^custom-[a-z0-9\u4e00-\u9fa5-]+$/);

const ACCEPTED_CUSTOM_FILE_TYPES = ".txt,.html,.htm,.docx,.xlsx,.xls,.csv,text/plain,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";

const customInterfaceManifestSchema = z.object({
    manifestVersion: z.literal(1).default(1),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    category: z.enum(["general", "school"]).default("school"),
    schoolName: z.string().max(80).optional(),
    inputLabel: z.string().min(1).max(80).optional(),
    uploadLabel: z.string().min(1).max(80).optional(),
    placeholder: z.string().min(1).max(1000).optional(),
    hints: z.array(z.string().min(1).max(160)).max(8).optional(),
    acceptedFileTypes: z.string().min(1).max(600).optional(),
    sortOrder: z.coerce.number().int().min(0).max(1000).default(500),
    aiPrompt: z.string().min(20).max(6000),
    semesterHint: z.string().max(160).optional(),
});

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

function rowToConfig(row: Record<string, unknown>): Partial<ImportInterfaceConfig> {
    const customMeta = row.custom_meta && typeof row.custom_meta === "object"
        ? row.custom_meta as ImportInterfaceConfig["customMeta"]
        : undefined;

    return {
        id: String(row.id ?? ""),
        category: row.category as ImportInterfaceCategory,
        adapterKey: row.adapter_key as ImportInterfaceConfig["adapterKey"],
        title: String(row.title ?? ""),
        description: String(row.description ?? ""),
        inputLabel: String(row.input_label ?? ""),
        uploadLabel: String(row.upload_label ?? ""),
        placeholder: String(row.placeholder ?? ""),
        hints: Array.isArray(row.hints) ? row.hints.map(String) : undefined,
        acceptedFileTypes: String(row.accepted_file_types ?? ""),
        enabled: Boolean(row.enabled),
        sortOrder: Number(row.sort_order ?? 0),
        schoolName: row.school_name ? String(row.school_name) : undefined,
        isCustom: String(row.id ?? "").startsWith("custom-"),
        customMeta,
    };
}

async function readImportInterfaceRows() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("import_interfaces")
        .select("*")
        .order("sort_order", { ascending: true });

    if (error) return null;
    return data.map((row) => rowToConfig(row as Record<string, unknown>));
}

export async function getAllImportInterfaces() {
    await assertSuperAdmin();
    const rows = await readImportInterfaceRows();
    return normalizeImportInterfaces(rows);
}

export async function getEnabledScheduleImportInterfaces() {
    const rows = await readImportInterfaceRows();
    return getEnabledImportInterfaces(rows);
}

export async function resetImportInterfacesToDefaults() {
    const supabase = await assertSuperAdmin();
    const rows = DEFAULT_IMPORT_INTERFACES.map((item) => ({
        id: item.id,
        category: item.category,
        adapter_key: item.adapterKey,
        title: item.title,
        description: item.description,
        input_label: item.inputLabel,
        upload_label: item.uploadLabel,
        placeholder: item.placeholder,
        hints: item.hints,
        accepted_file_types: item.acceptedFileTypes,
        enabled: item.enabled,
        sort_order: item.sortOrder,
        school_name: item.schoolName ?? null,
        custom_meta: item.customMeta ?? {},
    }));

    const { error } = await supabase.from("import_interfaces").upsert(rows, { onConflict: "id" });
    if (error) return { error: `保存默认接口失败：${error.message}` };
    revalidatePath("/admin/settings");
    revalidatePath("/dashboard/profile");
    return { success: true };
}

export async function updateImportInterface(formData: FormData) {
    const parsed = updateImportInterfaceSchema.safeParse({
        id: formData.get("id"),
        enabled: formData.get("enabled") === "on",
        title: formData.get("title"),
        description: formData.get("description"),
        sortOrder: formData.get("sortOrder"),
    });

    if (!parsed.success) return { error: "请检查接口配置" };

    const supabase = await assertSuperAdmin();
    const current = normalizeImportInterfaces(await readImportInterfaceRows()).find((item) => item.id === parsed.data.id);
    if (!current) return { error: "接口不存在" };

    const { error } = await supabase.from("import_interfaces").upsert({
        id: current.id,
        category: current.category,
        adapter_key: current.adapterKey,
        title: parsed.data.title,
        description: parsed.data.description,
        input_label: current.inputLabel,
        upload_label: current.uploadLabel,
        placeholder: current.placeholder,
        hints: current.hints,
        accepted_file_types: current.acceptedFileTypes,
        enabled: parsed.data.enabled,
        sort_order: parsed.data.sortOrder,
        school_name: current.schoolName ?? null,
        custom_meta: current.customMeta ?? {},
        updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    if (error) return { error: `保存接口失败：${error.message}` };
    revalidatePath("/admin/settings");
    revalidatePath("/dashboard/profile");
    return { success: true };
}

function slugify(value: string) {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 36);
    return slug || "schedule";
}

export async function uploadCustomImportInterface(formData: FormData) {
    const file = formData.get("manifest");
    if (!(file instanceof File)) return { error: "请选择 AI 生成的 JSON 清单文件" };
    if (file.size > 100 * 1024) return { error: "清单文件不能超过 100KB" };

    let json: unknown;
    try {
        json = JSON.parse(Buffer.from(await file.arrayBuffer()).toString("utf8"));
    } catch {
        return { error: "清单不是有效 JSON" };
    }

    const parsed = customInterfaceManifestSchema.safeParse(json);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message || "清单字段不完整" };

    const supabase = await assertSuperAdmin();
    const manifest = parsed.data;
    const id = `custom-${slugify(manifest.schoolName || manifest.title)}-${crypto.randomUUID().slice(0, 8)}`;
    const hints = manifest.hints?.length ? manifest.hints : [
        "复制该入口的 AI 提示词，把任意课表文件交给 AI 整理。",
        "AI 输出 BumpFree Schedule Import v1 文本后，粘贴到这里解析导入。",
    ];

    const { error } = await supabase.from("import_interfaces").insert({
        id,
        category: manifest.category,
        adapter_key: "generic-text",
        title: manifest.title,
        description: manifest.description,
        input_label: manifest.inputLabel || "粘贴 AI 整理后的课表文本",
        upload_label: manifest.uploadLabel || "上传课表文件",
        placeholder: manifest.placeholder || "先复制 AI 提示词，把原始课表文件交给 AI 整理，再把输出粘贴到这里。",
        hints,
        accepted_file_types: normalizeAcceptedFileTypes(manifest.acceptedFileTypes),
        enabled: true,
        sort_order: manifest.sortOrder,
        school_name: manifest.schoolName || null,
        custom_meta: {
            aiPrompt: manifest.aiPrompt,
            semesterHint: manifest.semesterHint,
            manifestVersion: manifest.manifestVersion,
            source: file.name,
        },
    });

    if (error) return { error: `新增导入入口失败：${error.message}` };
    revalidatePath("/admin/settings");
    revalidatePath("/dashboard/profile");
    return { success: true };
}

function normalizeAcceptedFileTypes(value: string | undefined): string {
    if (!value) return ACCEPTED_CUSTOM_FILE_TYPES;
    const allowed = new Set(ACCEPTED_CUSTOM_FILE_TYPES.split(","));
    const normalized = value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item, index, items) => allowed.has(item) && items.indexOf(item) === index);
    return normalized.length > 0 ? normalized.join(",") : ACCEPTED_CUSTOM_FILE_TYPES;
}

export async function deleteCustomImportInterface(id: string) {
    const parsedId = customInterfaceIdSchema.safeParse(id);
    if (!parsedId.success) return { error: "只能删除后台上传生成的自定义入口" };

    const supabase = await assertSuperAdmin();
    const { error } = await supabase.from("import_interfaces").delete().eq("id", parsedId.data);
    if (error) return { error: `删除导入入口失败：${error.message}` };

    revalidatePath("/admin/settings");
    revalidatePath("/dashboard/profile");
    return { success: true };
}
