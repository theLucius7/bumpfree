import type { ScheduleAdapter } from "./types";

export const manualReviewAdapter: ScheduleAdapter = {
    key: "manual-review",
    parse() {
        throw new Error("人工处理入口不支持自动解析");
    },
    config: {
        id: "manual-review",
        category: "general",
        adapterKey: "manual-review",
        title: "人工处理",
        description: "自动解析失败时，可以提交课表文本或图片，由管理员在后台处理。",
        inputLabel: "课表文本或说明",
        uploadLabel: "上传图片/TXT",
        placeholder: "粘贴原始课表文本，或简单说明图片来源、学期、学校等信息...",
        hints: [
            "适合自动解析失败、只有截图、格式不稳定或需要人工确认的课表。",
            "提交后不会立即导入课程，管理员会在后台待处理列表中查看并处理。",
        ],
        acceptedFileTypes: ".txt,.html,.htm,.png,.jpg,.jpeg,.webp,text/plain,text/html,image/png,image/jpeg,image/webp",
        enabled: true,
        sortOrder: 15,
        features: {
            manualReview: true,
        },
    },
};
