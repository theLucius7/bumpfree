import { parseGenericTextSchedule } from "@/lib/utils/textSchedule";
import type { ScheduleAdapter } from "./types";

export const genericTextAdapter: ScheduleAdapter = {
    key: "generic-text",
    parse: parseGenericTextSchedule,
    config: {
        id: "generic-text",
        category: "general",
        adapterKey: "generic-text",
        title: "通用文本 / AI 导入",
        description: "适用于 BumpFree v1、Word、Excel、HTML、CSV、手机粘贴文本或 AI 整理后的课表。",
        inputLabel: "课表文本",
        uploadLabel: "上传课表文件",
        placeholder: "粘贴 BumpFree v1 文本，或受支持的松散课表文本...",
        hints: [
            "可以直接粘贴 BumpFree Schedule Import v1 文本，或上传 DOCX、XLSX、XLS、CSV、HTML、TXT 抽取文本。",
            "PDF 暂不在站内直接解析；请先用本地工具或可信 AI 转为文本，再粘贴导入。",
            "复杂版式如果无法直接识别，可先让 AI 整理成 v1 格式；导入前务必检查预览。",
            "解析预览确认前不会保存任何课程。",
        ],
        acceptedFileTypes: ".txt,.html,.htm,.docx,.xlsx,.xls,.csv,text/plain,text/html,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
        enabled: true,
        sortOrder: 10,
        features: {
            showTemplateTools: true,
        },
    },
};
