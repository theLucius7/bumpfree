import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { ScheduleImportPanel } from "@/components/dashboard/ScheduleImportPanel";
import { WakeUpImportPanel } from "@/components/dashboard/WakeUpImportPanel";
import { RescheduleNoticeImportPanel } from "@/components/dashboard/RescheduleNoticeImportPanel";
import { getEnabledScheduleImportInterfaces } from "@/lib/actions/import-interfaces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Calendar } from "lucide-react";
import { setActiveSchedule } from "@/lib/actions/courses";
import { Button } from "@/components/ui/button";
import { DeleteScheduleButton } from "@/components/dashboard/DeleteScheduleButton";
import { CourseEditorDialog } from "@/components/dashboard/CourseEditorDialog";
import { DeleteCourseButton } from "@/components/dashboard/DeleteCourseButton";
import { MEMBER_COLORS } from "@/lib/utils/colors";

const DAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default async function ProfilePage() {
    const supabase = await createClient();
    const { user, profile } = await getCurrentUserProfile();
    if (!user) redirect("/auth/login");

    const { data: schedules } = await supabase
        .from("schedules")
        .select("*, courses(*)")
        .eq("user_id", user.id)
        .order("imported_at", { ascending: false });

    const hasSchedule = (schedules?.length ?? 0) > 0;
    const scheduleCount = schedules?.length ?? 0;
    const quota = profile?.schedule_quota ?? 3;
    const quotaReached = scheduleCount >= quota;
    const importInterfaces = await getEnabledScheduleImportInterfaces();

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">我的课表</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        通过 WakeUp、文本或 HTML 导入课表数据，支持多课表存档管理
                    </p>
                </div>
                <div className="text-right">
                    <Badge variant={quotaReached ? "destructive" : "secondary"} className="text-xs">
                        已保存 {scheduleCount} / {quota}
                    </Badge>
                </div>
            </div>

            {quotaReached && (
                <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-sm text-destructive flex items-start gap-3">
                    <BookOpen className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold mb-1">课表额度已满</p>
                        <p className="opacity-90">你的账号目前最多保存 {quota} 份课表。仍可覆盖或追加到同名学期；新建学期前请先删除下方的过期课表。</p>
                    </div>
                </div>
            )}

            <WakeUpImportPanel hasSchedule={hasSchedule} />
            <ScheduleImportPanel interfaces={importInterfaces} canCreateSchedule={!quotaReached} />

            <div className="space-y-2">
                <RescheduleNoticeImportPanel />
                <p className="px-1 text-xs text-muted-foreground" role="note">
                    调课导入只会新增一段一次性 busy 时间，不会自动取消、删除或修改原课表中的课程。
                </p>
            </div>

            {hasSchedule && (
                <div className="space-y-4">
                    <h2 className="text-base font-semibold">已存课表</h2>
                    {schedules?.map((schedule) => (
                        <Card key={schedule.id} className={schedule.is_active ? "border-primary/40 ring-1 ring-primary/20 shadow-sm" : ""}>
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <BookOpen className={schedule.is_active ? "w-4 h-4 text-primary" : "w-4 h-4 text-muted-foreground"} />
                                            {schedule.semester_tag}
                                            {schedule.is_active && (
                                                <Badge variant="default" className="text-xs">当前使用</Badge>
                                            )}
                                        </CardTitle>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {schedule.school} · 起始 {schedule.start_date} · {schedule.max_weeks} 周
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CourseEditorDialog
                                            scheduleId={schedule.id}
                                            scheduleName={schedule.semester_tag}
                                        />
                                        {!schedule.is_active && (
                                            <form
                                                action={async () => {
                                                    "use server";
                                                    await setActiveSchedule(schedule.id);
                                                }}
                                            >
                                                <Button variant="outline" size="sm" type="submit" className="h-8">
                                                    设为当前
                                                </Button>
                                            </form>
                                        )}
                                        <DeleteScheduleButton scheduleId={schedule.id} scheduleName={schedule.semester_tag} />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground mb-3">
                                    共 {schedule.courses?.length ?? 0} 条课程记录
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {schedule.courses?.slice(0, 6).map((course: {
                                        id: string;
                                        name: string;
                                        day_of_week: number;
                                        start_time: string;
                                        end_time: string;
                                        room: string | null;
                                        teacher: string | null;
                                        color: string | null;
                                        start_week: number;
                                        end_week: number;
                                    }) => (
                                        <div
                                            key={course.id}
                                            className="flex items-start gap-2 p-2 rounded-md border border-border/60 text-sm"
                                        >
                                            <span
                                                className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                                                style={{ backgroundColor: course.color ?? MEMBER_COLORS[0] }}
                                            />
                                            <div className="min-w-0">
                                                <p className="font-medium truncate">{course.name}</p>
                                                <p className="text-muted-foreground text-xs">
                                                    {DAY_NAMES[course.day_of_week]} {course.start_time}-{course.end_time}
                                                    {course.teacher && ` · ${course.teacher}`}
                                                </p>
                                                <p className="text-muted-foreground text-xs">
                                                    第 {course.start_week}-{course.end_week} 周
                                                    {course.room && ` · ${course.room}`}
                                                </p>
                                            </div>
                                            <div className="ml-auto flex items-center gap-1">
                                                <CourseEditorDialog
                                                    scheduleId={schedule.id}
                                                    scheduleName={schedule.semester_tag}
                                                    course={course}
                                                />
                                                <DeleteCourseButton
                                                    courseId={course.id}
                                                    courseName={course.name}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {(schedule.courses?.length ?? 0) > 6 && (
                                        <div className="p-2 text-sm text-muted-foreground">
                                            ...还有 {schedule.courses.length - 6} 条
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {!hasSchedule && (
                <div className="text-center py-12 text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>还没有导入任何课表</p>
                    <p className="text-sm mt-1">从上方导入文本或 HTML 课表开始</p>
                </div>
            )}
        </div>
    );
}
