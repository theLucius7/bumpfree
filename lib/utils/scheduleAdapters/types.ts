import type { ParsedTextSchedule } from "@/lib/utils/textSchedule";

export type ImportInterfaceCategory = "general" | "school";

export interface ScheduleAdapterFeatures {
    showTemplateTools?: boolean;
    manualReview?: boolean;
}

export interface CustomImportInterfaceMeta {
    aiPrompt?: string;
    semesterHint?: string;
    manifestVersion?: number;
    source?: string;
}

export interface ScheduleAdapterConfig {
    id: string;
    category: ImportInterfaceCategory;
    adapterKey: string;
    title: string;
    description: string;
    inputLabel: string;
    uploadLabel: string;
    placeholder: string;
    hints: string[];
    acceptedFileTypes: string;
    enabled: boolean;
    sortOrder: number;
    schoolName?: string;
    features?: ScheduleAdapterFeatures;
    isCustom?: boolean;
    customMeta?: CustomImportInterfaceMeta;
}

export interface ScheduleAdapter {
    key: string;
    config: ScheduleAdapterConfig;
    parse(input: string): ParsedTextSchedule;
}
