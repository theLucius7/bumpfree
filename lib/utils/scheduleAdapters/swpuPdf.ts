import { parseSwpuPdfTextSchedule } from "@/lib/utils/textSchedule";
import type { ScheduleAdapter } from "./types";

export const swpuPdfAdapter: ScheduleAdapter = {
    key: "swpu-pdf-text",
    parse: parseSwpuPdfTextSchedule,
    config: {
        id: "swpu-pdf",
        category: "school",
        adapterKey: "swpu-pdf-text",
        schoolName: "西南石油大学",
        title: "西南石油大学课表文本导入",
        description: "适用于西南石油大学 timeTableForStu 课表安全转换后的文本。",
        inputLabel: "课表文本",
        uploadLabel: "上传 TXT",
        placeholder: "粘贴 timeTableForStu PDF 经本地工具或可信 AI 抽取后的课表文本...",
        hints: [
            "出于服务端内存安全考虑，PDF 不在站内直接解析；请先在本地或可信 AI 工具中抽取为 UTF-8 文本。",
            "专用适配器会从文本解析课程代码、周次、星期、节次和教室。",
            "节次会按西南石油大学教学日历中的作息时间映射为具体开始/结束时间，预览中仍可手动调整学期信息。",
        ],
        acceptedFileTypes: ".txt,text/plain",
        enabled: true,
        sortOrder: 30,
    },
};
