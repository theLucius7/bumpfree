import {
    getDefaultImportInterfaceConfigs,
    type ImportInterfaceCategory,
    type CustomImportInterfaceMeta,
    type ScheduleAdapterConfig,
    type ScheduleAdapterFeatures,
} from "@/lib/utils/scheduleAdapters/registry";

export type { CustomImportInterfaceMeta, ImportInterfaceCategory, ScheduleAdapterFeatures };

export interface ImportInterfaceConfig extends ScheduleAdapterConfig {
    category: ImportInterfaceCategory;
    features?: ScheduleAdapterFeatures;
}

export const DEFAULT_IMPORT_INTERFACES: ImportInterfaceConfig[] = getDefaultImportInterfaceConfigs();

function normalizeCustomRow(row: Partial<ImportInterfaceConfig>): ImportInterfaceConfig | null {
    if (!row.id?.startsWith("custom-")) return null;
    if (row.adapterKey !== "generic-text") return null;
    if (row.category !== "general" && row.category !== "school") return null;
    if (!row.title || !row.description) return null;

    return {
        id: row.id,
        category: row.category,
        adapterKey: "generic-text",
        title: row.title,
        description: row.description,
        inputLabel: row.inputLabel || "粘贴 AI 整理后的课表文本",
        uploadLabel: row.uploadLabel || "上传课表文件",
        placeholder: row.placeholder || "把原始课表文件交给 AI，按提示词整理成 BumpFree Schedule Import v1 后粘贴到这里。",
        hints: Array.isArray(row.hints) && row.hints.length > 0 ? row.hints : [
            "这个入口由后台上传的格式清单生成。",
            "先复制该入口的 AI 提示词，把任意课表文件交给 AI 整理，再把输出粘贴回来导入。",
        ],
        acceptedFileTypes: row.acceptedFileTypes || ".txt,.html,.htm,.docx,.xlsx,.xls,.csv,text/plain,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv",
        enabled: typeof row.enabled === "boolean" ? row.enabled : true,
        sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 500,
        schoolName: row.schoolName,
        features: row.features && typeof row.features === "object" ? row.features : { showTemplateTools: false },
        isCustom: true,
        customMeta: row.customMeta && typeof row.customMeta === "object" ? row.customMeta as CustomImportInterfaceMeta : undefined,
    };
}

export function normalizeImportInterfaces(rows: Partial<ImportInterfaceConfig>[] | null | undefined) {
    const byId = new Map(DEFAULT_IMPORT_INTERFACES.map((item) => [item.id, item]));
    const customRows: ImportInterfaceConfig[] = [];
    for (const row of rows ?? []) {
        if (!row.id) continue;
        const base = byId.get(row.id);
        if (!base) {
            const custom = normalizeCustomRow(row);
            if (custom) customRows.push(custom);
            continue;
        }
        byId.set(row.id, {
            ...base,
            ...row,
            hints: Array.isArray(row.hints) ? row.hints : base.hints,
            features: row.features && typeof row.features === "object" ? row.features : base.features,
            customMeta: row.customMeta && typeof row.customMeta === "object" ? row.customMeta : base.customMeta,
            enabled: typeof row.enabled === "boolean" ? row.enabled : base.enabled,
            sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : base.sortOrder,
        });
    }
    return [...byId.values(), ...customRows].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getEnabledImportInterfaces(rows: Partial<ImportInterfaceConfig>[] | null | undefined) {
    return normalizeImportInterfaces(rows).filter((item) => item.enabled);
}
