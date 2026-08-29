"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addBusyBlock } from "@/lib/actions/busy";
import { addManualCourse, updateCourse } from "@/lib/actions/courses";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const T = {
    mon: "\u5468\u4e00",
    tue: "\u5468\u4e8c",
    wed: "\u5468\u4e09",
    thu: "\u5468\u56db",
    fri: "\u5468\u4e94",
    sat: "\u5468\u516d",
    sun: "\u5468\u65e5",
    manualCourse: "\u624b\u52a8\u52a0\u8bfe",
    editCourse: "\u7f16\u8f91\u8bfe\u7a0b",
    addToSchedulePrefix: "\u4e3a ",
    addToScheduleSuffix: " \u6dfb\u52a0\u8bfe\u7a0b",
    recurring: "\u5468\u671f\u8bfe\u7a0b",
    temporary: "\u4e34\u65f6\u65f6\u95f4",
    courseName: "\u8bfe\u7a0b\u540d\u79f0 *",
    coursePlaceholder: "\u9ad8\u7b49\u6570\u5b66",
    teacher: "\u6559\u5e08",
    teacherPlaceholder: "\u5f20\u8001\u5e08",
    slot: "\u65f6\u95f4\u6bb5",
    addSlot: "\u6dfb\u52a0\u65f6\u95f4\u6bb5",
    weekday: "\u661f\u671f *",
    chooseDay: "\u9009\u62e9\u661f\u671f",
    startTime: "\u5f00\u59cb\u65f6\u95f4 *",
    endTime: "\u7ed3\u675f\u65f6\u95f4 *",
    startWeek: "\u5f00\u59cb\u5468 *",
    endWeek: "\u7ed3\u675f\u5468 *",
    room: "\u6559\u5ba4",
    roomPlaceholder: "A-302",
    busyTitle: "busy \u6807\u9898 *",
    busyPlaceholder: "\u4e34\u65f6\u5360\u7528",
    busyStart: "\u5f00\u59cb *",
    busyEnd: "\u7ed3\u675f *",
    cancel: "\u53d6\u6d88",
    save: "\u4fdd\u5b58\u4fee\u6539",
    addCourse: "\u6dfb\u52a0\u8bfe\u7a0b",
    addBusy: "\u52a0\u5165 busy",
    courseUpdated: "\u8bfe\u7a0b\u5df2\u66f4\u65b0",
    courseAdded: "\u8bfe\u7a0b\u5df2\u6dfb\u52a0",
    busyAdded: "busy \u65f6\u95f4\u5df2\u52a0\u5165",
    invalidBusyTime: "\u8bf7\u68c0\u67e5\u4e34\u65f6\u65f6\u95f4",
};

const DAY_OPTIONS = [
    { value: "1", label: T.mon },
    { value: "2", label: T.tue },
    { value: "3", label: T.wed },
    { value: "4", label: T.thu },
    { value: "5", label: T.fri },
    { value: "6", label: T.sat },
    { value: "7", label: T.sun },
];

interface CourseEditorDialogProps {
    scheduleId: string;
    scheduleName: string;
    course?: {
        id: string;
        name: string;
        room: string | null;
        teacher: string | null;
        day_of_week: number;
        start_time: string;
        end_time: string;
        start_week: number;
        end_week: number;
    };
}

interface CourseSlotDraft {
    id: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    startWeek: string;
    endWeek: string;
    room: string;
}

type AddMode = "course" | "busy";

function newSlot(): CourseSlotDraft {
    return {
        id: crypto.randomUUID(),
        dayOfWeek: "1",
        startTime: "08:00",
        endTime: "09:40",
        startWeek: "1",
        endWeek: "18",
        room: "",
    };
}

export function CourseEditorDialog({ scheduleId, scheduleName, course }: CourseEditorDialogProps) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<AddMode>("course");
    const [dayOfWeek, setDayOfWeek] = useState(String(course?.day_of_week ?? 1));
    const [slots, setSlots] = useState<CourseSlotDraft[]>(() => [newSlot()]);
    const [busyStart, setBusyStart] = useState("");
    const [busyEnd, setBusyEnd] = useState("");
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const isEdit = Boolean(course);
    const title = isEdit ? T.editCourse : `${T.addToSchedulePrefix}${scheduleName}${T.addToScheduleSuffix}`;

    const slotsJson = useMemo(() => JSON.stringify(slots.map((slot) => ({
        room: slot.room,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        startWeek: slot.startWeek,
        endWeek: slot.endWeek,
    }))), [slots]);

    function resetState(nextOpen: boolean) {
        setOpen(nextOpen);
        if (nextOpen) return;
        setMode("course");
        setDayOfWeek(String(course?.day_of_week ?? 1));
        setSlots([newSlot()]);
        setBusyStart("");
        setBusyEnd("");
    }

    function updateSlot(id: string, patch: Partial<CourseSlotDraft>) {
        setSlots((current) => current.map((slot) => slot.id === id ? { ...slot, ...patch } : slot));
    }

    function removeSlot(id: string) {
        setSlots((current) => current.length === 1 ? current : current.filter((slot) => slot.id !== id));
    }

    function handleSubmit(formData: FormData) {
        formData.set("scheduleId", scheduleId);
        if (course) {
            formData.set("courseId", course.id);
            formData.set("dayOfWeek", dayOfWeek);
        } else {
            formData.set("slotsJson", slotsJson);
        }

        startTransition(async () => {
            const result = course ? await updateCourse(formData) : await addManualCourse(formData);
            if (result.error) {
                toast.error(result.error);
                return;
            }
            toast.success(course ? T.courseUpdated : T.courseAdded);
            setOpen(false);
            router.refresh();
        });
    }

    function handleBusySubmit(formData: FormData) {
        const startsAt = new Date(busyStart);
        const endsAt = new Date(busyEnd);
        if (!busyStart || !busyEnd || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
            toast.error(T.invalidBusyTime);
            return;
        }

        startTransition(async () => {
            const result = await addBusyBlock({
                title: String(formData.get("busyTitle") || T.busyPlaceholder),
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
                note: String(formData.get("busyNote") || ""),
            });
            if (result.error) {
                toast.error(result.error);
                return;
            }
            toast.success(T.busyAdded);
            setOpen(false);
            router.refresh();
        });
    }

    return (
        <Dialog open={open} onOpenChange={resetState}>
            <DialogTrigger asChild>
                {isEdit ? (
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                        <Pencil className="w-4 h-4" />
                    </Button>
                ) : (
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <Plus className="w-3.5 h-3.5" />{T.manualCourse}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                {!isEdit && (
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                        <Button type="button" size="sm" variant={mode === "course" ? "default" : "ghost"} className="flex-1" onClick={() => setMode("course")}>{T.recurring}</Button>
                        <Button type="button" size="sm" variant={mode === "busy" ? "default" : "ghost"} className="flex-1" onClick={() => setMode("busy")}>{T.temporary}</Button>
                    </div>
                )}

                {mode === "busy" && !isEdit ? (
                    <form action={handleBusySubmit} className="space-y-4 mt-2">
                        <div className="space-y-2">
                            <Label htmlFor={`busy-title-${scheduleId}`}>{T.busyTitle}</Label>
                            <Input id={`busy-title-${scheduleId}`} name="busyTitle" placeholder={T.busyPlaceholder} defaultValue={T.busyPlaceholder} required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor={`busy-start-${scheduleId}`}>{T.busyStart}</Label>
                                <Input id={`busy-start-${scheduleId}`} type="datetime-local" value={busyStart} onChange={(event) => setBusyStart(event.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor={`busy-end-${scheduleId}`}>{T.busyEnd}</Label>
                                <Input id={`busy-end-${scheduleId}`} type="datetime-local" value={busyEnd} onChange={(event) => setBusyEnd(event.target.value)} required />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{T.cancel}</Button>
                            <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{T.addBusy}</Button>
                        </div>
                    </form>
                ) : (
                    <form action={handleSubmit} className="space-y-4 mt-2">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor={`course-name-${course?.id ?? scheduleId}`}>{T.courseName}</Label>
                                <Input id={`course-name-${course?.id ?? scheduleId}`} name="name" placeholder={T.coursePlaceholder} defaultValue={course?.name ?? ""} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor={`teacher-${course?.id ?? scheduleId}`}>{T.teacher}</Label>
                                <Input id={`teacher-${course?.id ?? scheduleId}`} name="teacher" placeholder={T.teacherPlaceholder} defaultValue={course?.teacher ?? ""} />
                            </div>
                        </div>

                        {isEdit ? (
                            <SingleSlotFields course={course} dayOfWeek={dayOfWeek} setDayOfWeek={setDayOfWeek} />
                        ) : (
                            <div className="space-y-3">
                                {slots.map((slot, index) => (
                                    <div key={slot.id} className="rounded-md border border-border/60 p-3 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-medium">{T.slot} {index + 1}</p>
                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeSlot(slot.id)} disabled={slots.length === 1}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <SlotDraftFields slot={slot} onChange={(patch) => updateSlot(slot.id, patch)} />
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => setSlots((current) => [...current, newSlot()])}>
                                    <Plus className="w-4 h-4 mr-2" />{T.addSlot}
                                </Button>
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{T.cancel}</Button>
                            <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{isEdit ? T.save : T.addCourse}</Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

function SingleSlotFields({ course, dayOfWeek, setDayOfWeek }: {
    course: NonNullable<CourseEditorDialogProps["course"]> | undefined;
    dayOfWeek: string;
    setDayOfWeek: (value: string) => void;
}) {
    return (
        <>
            <div className="grid grid-cols-2 gap-3">
                <DaySelect value={dayOfWeek} onValueChange={setDayOfWeek} />
                <div className="space-y-2">
                    <Label htmlFor={`room-${course?.id ?? "new"}`}>{T.room}</Label>
                    <Input id={`room-${course?.id ?? "new"}`} name="room" placeholder={T.roomPlaceholder} defaultValue={course?.room ?? ""} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <TimeInput id={`start-time-${course?.id ?? "new"}`} name="startTime" label={T.startTime} defaultValue={course?.start_time ?? "08:00"} />
                <TimeInput id={`end-time-${course?.id ?? "new"}`} name="endTime" label={T.endTime} defaultValue={course?.end_time ?? "09:40"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <NumberInput id={`start-week-${course?.id ?? "new"}`} name="startWeek" label={T.startWeek} defaultValue={course?.start_week ?? 1} />
                <NumberInput id={`end-week-${course?.id ?? "new"}`} name="endWeek" label={T.endWeek} defaultValue={course?.end_week ?? 18} />
            </div>
        </>
    );
}

function SlotDraftFields({ slot, onChange }: { slot: CourseSlotDraft; onChange: (patch: Partial<CourseSlotDraft>) => void }) {
    return (
        <>
            <div className="grid grid-cols-2 gap-3">
                <DaySelect value={slot.dayOfWeek} onValueChange={(dayOfWeek) => onChange({ dayOfWeek })} />
                <div className="space-y-2">
                    <Label>{T.room}</Label>
                    <Input placeholder={T.roomPlaceholder} value={slot.room} onChange={(event) => onChange({ room: event.target.value })} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <TimeInput label={T.startTime} value={slot.startTime} onChange={(value) => onChange({ startTime: value })} />
                <TimeInput label={T.endTime} value={slot.endTime} onChange={(value) => onChange({ endTime: value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <NumberInput label={T.startWeek} value={slot.startWeek} onChange={(value) => onChange({ startWeek: value })} />
                <NumberInput label={T.endWeek} value={slot.endWeek} onChange={(value) => onChange({ endWeek: value })} />
            </div>
        </>
    );
}

function DaySelect({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
    return (
        <div className="space-y-2">
            <Label>{T.weekday}</Label>
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger><SelectValue placeholder={T.chooseDay} /></SelectTrigger>
                <SelectContent>{DAY_OPTIONS.map((day) => <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>)}</SelectContent>
            </Select>
        </div>
    );
}

function TimeInput({ id, name, label, defaultValue, value, onChange }: { id?: string; name?: string; label: string; defaultValue?: string; value?: string; onChange?: (value: string) => void }) {
    return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} type="time" defaultValue={defaultValue} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} required /></div>;
}

function NumberInput({ id, name, label, defaultValue, value, onChange }: { id?: string; name?: string; label: string; defaultValue?: number; value?: string; onChange?: (value: string) => void }) {
    return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} type="number" min={1} defaultValue={defaultValue} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} required /></div>;
}
