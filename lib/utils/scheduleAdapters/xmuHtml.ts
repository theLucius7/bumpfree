import { parseXmuHtmlSchedule } from "@/lib/utils/textSchedule";
import type { ScheduleAdapter } from "./types";

export const xmuHtmlAdapter: ScheduleAdapter = {
    key: "xmu-html",
    parse: parseXmuHtmlSchedule,
    config: {
        id: "xmu-html",
        category: "school",
        adapterKey: "xmu-html",
        schoolName: "厦门大学马来西亚分校",
        title: "厦马 HTML 课表导入",
        description: "适用于 XMUM / 厦马教务系统导出或复制的完整 HTML 课表页。",
        inputLabel: "厦马 HTML",
        uploadLabel: "拖拽或上传 HTML/TXT",
        placeholder: "上传 .html/.htm，或粘贴包含 <table>...</table> 的厦马课表 HTML...",
        hints: [
            "在教务系统打开周课表后，保存网页为 .html/.htm，或全选课表 HTML 内容粘贴到这里。",
            "系统会读取 Time 列、Monday-Sunday 列、rowspan 时长、Week 1-14、教师和教室；若 HTML 没有学期，会按当前月份推断。",
        ],
        acceptedFileTypes: ".html,.htm,text/html,text/plain",
        enabled: true,
        sortOrder: 20,
    },
};
