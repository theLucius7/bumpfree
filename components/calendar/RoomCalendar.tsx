"use client";

import { useMemo, useState, useTransition } from "react";
import { Calendar, dateFnsLocalizer, type SlotInfo, type View } from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { addBusyBlock, deleteBusyBlock } from "@/lib/actions/busy";
import { expandBusyBlocks, expandCourses, expandMalaysiaHolidays } from "@/lib/utils/calendar";
import type { BusyBlock, CalendarEvent, Course, MalaysiaHoliday, Schedule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hexToRgba } from "@/lib/utils/colors";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, LayoutGrid, Loader2, User } from "lucide-react";
import { toast } from "sonner";

const localizer = dateFnsLocalizer({ format, parse, startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }), getDay, locales: { "zh-CN": zhCN } });

interface MemberData { userId: string; displayName: string; color: string; schedule: Pick<Schedule, "id" | "semester_tag" | "start_date" | "max_weeks"> | null; courses: Course[]; busyBlocks: BusyBlock[]; }
interface RoomCalendarProps { memberData: MemberData[]; holidays: MalaysiaHoliday[]; roomId: string; roomName: string; currentUserId: string | null; isReadOnly: boolean; }
type ViewMode = "month" | "week" | "person";

export function RoomCalendar({ memberData, holidays, roomId, roomName, currentUserId, isReadOnly }: RoomCalendarProps) {
    const [viewMode, setViewMode] = useState<ViewMode>("week");
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [dialogOpen, setDialogOpen] = useState(false);
    const [busyTitle, setBusyTitle] = useState("\u4e34\u65f6\u5360\u7528");
    const [busyStart, setBusyStart] = useState("");
    const [busyEnd, setBusyEnd] = useState("");
    const [isPending, startTransition] = useTransition();

    const allEvents = useMemo(() => {
        const events: CalendarEvent[] = [];
        for (const member of memberData) {
            if (member.schedule) events.push(...expandCourses(member.courses, member.schedule, member.userId, member.displayName, member.color));
            events.push(...expandBusyBlocks(member.busyBlocks, member.userId, member.displayName, member.color));
        }
        events.push(...expandMalaysiaHolidays(holidays));
        return events;
    }, [memberData, holidays]);

    const displayEvents = useMemo(() => viewMode === "person" && selectedUserId ? allEvents.filter((e) => e.resource.kind === "holiday" || e.resource.userId === selectedUserId) : allEvents, [allEvents, selectedUserId, viewMode]);
    const rbcView: View = viewMode === "person" ? "week" : viewMode;
    const canEdit = !isReadOnly && Boolean(currentUserId);

    function eventStyleGetter(event: CalendarEvent) {
        if (event.resource.kind === "holiday") return { style: { backgroundColor: "rgba(100, 116, 139, 0.18)", borderLeft: "3px solid #64748b", color: "hsl(var(--foreground))", borderRadius: "4px", fontSize: "0.72rem", padding: "1px 4px" } };
        const alpha = event.resource.kind === "busy" ? 0.45 : 0.85;
        return { style: { backgroundColor: hexToRgba(event.resource.color, alpha), borderLeft: `3px solid ${event.resource.color}`, color: event.resource.kind === "busy" ? "hsl(var(--foreground))" : "#fff", borderRadius: "4px", fontSize: "0.72rem", padding: "1px 4px" } };
    }

    function EventComponent({ event }: { event: CalendarEvent }) {
        const label = event.resource.kind === "holiday" ? "\u9a6c\u6765\u897f\u4e9a\u516c\u5171\u5047\u671f" : event.resource.kind === "busy" ? "busy" : event.resource.displayName;
        return <div className="leading-tight"><div className="font-medium truncate">{event.resource.courseName}</div><div className="opacity-80 truncate text-[0.65rem]">{label}{event.resource.room && ` \u00b7 ${event.resource.room}`}</div></div>;
    }

    function MonthEventComponent({ event }: { event: CalendarEvent }) {
        return <div className="flex items-center gap-1 px-1" style={{ color: event.resource.color }}><span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: event.resource.color }} /><span className="truncate text-xs font-medium">{event.resource.kind === "holiday" ? event.resource.courseName : event.resource.displayName}</span></div>;
    }

    function handleSelectSlot(slot: SlotInfo) {
        if (!canEdit) return;
        const start = slot.start;
        const end = slot.end > start ? slot.end : new Date(start.getTime() + 30 * 60 * 1000);
        setBusyTitle("\u4e34\u65f6\u5360\u7528"); setBusyStart(toDateTimeInputValue(start)); setBusyEnd(toDateTimeInputValue(end)); setDialogOpen(true);
    }

    function handleAddBusy() {
        const start = new Date(busyStart);
        const end = new Date(busyEnd);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            toast.error("请检查开始和结束时间");
            return;
        }
        startTransition(async () => {
            const result = await addBusyBlock({ title: busyTitle.trim() || "\u4e34\u65f6\u5360\u7528", startsAt: start.toISOString(), endsAt: end.toISOString(), roomId });
            if (result.error) { toast.error(result.error); return; }
            toast.success("\u5df2\u52a0\u5165 busy \u65f6\u95f4"); setDialogOpen(false);
        });
    }

    function handleSelectEvent(event: CalendarEvent) {
        if (event.resource.kind !== "busy" || event.resource.userId !== currentUserId) return;
        if (!window.confirm("\u5220\u9664\u8fd9\u6bb5 busy \u65f6\u95f4\uff1f")) return;
        startTransition(async () => {
            const result = await deleteBusyBlock(event.id, roomId);
            if (result.error) { toast.error(result.error); return; }
            toast.success("\u5df2\u5220\u9664 busy \u65f6\u95f4");
        });
    }

    return (
        <div className="flex flex-col h-[calc(100vh-3.5rem)] relative" aria-label={roomName}>
            <div className="border-b border-border/60 px-4 py-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    <Button type="button" aria-pressed={viewMode === "month"} variant={viewMode === "month" ? "default" : "ghost"} size="sm" className="h-7 px-3 text-xs gap-1" onClick={() => setViewMode("month")}><LayoutGrid className="w-3.5 h-3.5" />{"\u6708\u89c6\u56fe"}</Button>
                    <Button type="button" aria-pressed={viewMode === "week"} variant={viewMode === "week" ? "default" : "ghost"} size="sm" className="h-7 px-3 text-xs gap-1" onClick={() => setViewMode("week")}><CalendarIcon className="w-3.5 h-3.5" />{"\u5468\u89c6\u56fe"}</Button>
                    <Button type="button" aria-pressed={viewMode === "person"} variant={viewMode === "person" ? "default" : "ghost"} size="sm" className="h-7 px-3 text-xs gap-1" onClick={() => { setViewMode("person"); if (!selectedUserId && memberData[0]) setSelectedUserId(memberData[0].userId); }}><User className="w-3.5 h-3.5" />{"\u6309\u4eba"}</Button>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" aria-label="上一时间段" variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentDate((d) => { const next = new Date(d); if (viewMode === "month") next.setMonth(next.getMonth() - 1); else next.setDate(next.getDate() - 7); return next; })}><ChevronLeft className="w-4 h-4" /></Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCurrentDate(new Date())}>{"\u4eca\u5929"}</Button>
                    <Button type="button" aria-label="下一时间段" variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentDate((d) => { const next = new Date(d); if (viewMode === "month") next.setMonth(next.getMonth() + 1); else next.setDate(next.getDate() + 7); return next; })}><ChevronRight className="w-4 h-4" /></Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">{memberData.map((m) => <button type="button" key={m.userId} aria-pressed={viewMode === "person" && selectedUserId === m.userId} onClick={() => viewMode === "person" && setSelectedUserId(m.userId)} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${viewMode === "person" && selectedUserId === m.userId ? "ring-2 ring-offset-1 bg-muted" : "hover:bg-muted"}`}><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} /><span className="font-medium">{m.displayName}</span></button>)}{isReadOnly && <Badge variant="outline" className="text-xs">{"\u53ea\u8bfb\u6a21\u5f0f"}</Badge>}</div>
            </div>
            <div className="flex-1 overflow-hidden p-2">
                <style>{`.rbc-calendar{height:100%!important;font-family:var(--font-geist-sans),sans-serif}.rbc-toolbar{display:none}.rbc-time-view,.rbc-month-view{border:none}.rbc-header{padding:8px 4px;font-size:.8rem;font-weight:500;color:hsl(var(--muted-foreground));border-bottom:1px solid hsl(var(--border))}.rbc-day-bg+.rbc-day-bg{border-left:1px solid hsl(var(--border))}.rbc-month-row+.rbc-month-row{border-top:1px solid hsl(var(--border))}.rbc-off-range-bg{background:hsl(var(--muted)/30%)}.rbc-today{background:hsl(var(--primary)/5%)}.rbc-event{border:none!important}.rbc-event.rbc-selected{box-shadow:0 0 0 2px hsl(var(--primary))}.rbc-slot-selection{background:hsl(var(--primary)/20%)}.rbc-time-content{border-top:1px solid hsl(var(--border))}.rbc-time-slot{border-top:1px solid hsl(var(--border)/40%)}.rbc-timeslot-group{border-bottom:1px solid hsl(var(--border))}.rbc-time-header-content{border-left:1px solid hsl(var(--border))}.rbc-day-slot .rbc-time-slot{border-top:1px solid hsl(var(--border)/30%)}.rbc-time-gutter .rbc-time-slot{font-size:.7rem;color:hsl(var(--muted-foreground))}.dark .rbc-calendar{color-scheme:dark}.dark .rbc-month-view,.dark .rbc-time-view,.dark .rbc-header,.dark .rbc-time-content{background:hsl(var(--background))}.dark .rbc-off-range-bg{background:hsl(var(--muted)/20%)}.dark .rbc-today{background:hsl(var(--primary)/8%)}`}</style>
                <Calendar localizer={localizer} events={displayEvents} view={rbcView} onView={() => {}} date={currentDate} onNavigate={setCurrentDate} eventPropGetter={eventStyleGetter} components={{ event: viewMode === "month" ? MonthEventComponent : EventComponent }} culture="zh-CN" min={new Date(0, 0, 0, 7, 0)} max={new Date(0, 0, 0, 22, 0)} popup selectable={canEdit} onSelectSlot={handleSelectSlot} onSelectEvent={handleSelectEvent} step={30} timeslots={2} style={{ height: "100%" }} messages={{ noEventsInRange: "\u8be5\u65f6\u95f4\u6bb5\u5185\u6ca1\u6709\u8bfe\u7a0b", showMore: (total) => `${"\u8fd8\u6709"} ${total} ${"\u8282\u8bfe"}` }} />
            </div>
            {memberData.length === 0 && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="text-center text-muted-foreground"><CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{"\u6682\u65e0\u6210\u5458\u8bfe\u8868\u6570\u636e"}</p><p className="text-sm mt-1">{"\u9080\u8bf7\u6210\u5458\u52a0\u5165\u5e76\u8ba9\u4ed6\u4eec\u5bfc\u5165\u8bfe\u8868"}</p></div></div>}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{"\u52a0\u5165\u4e34\u65f6 busy \u65f6\u95f4"}</DialogTitle><DialogDescription>{"\u8fd9\u6bb5\u65f6\u95f4\u4f1a\u663e\u793a\u4e3a\u4f60\u7684\u5360\u7528\uff0c\u540c Room \u6210\u5458\u53ef\u89c1\u3002"}</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="busy-title">{"\u6807\u9898"}</Label><Input id="busy-title" value={busyTitle} maxLength={80} onChange={(e) => setBusyTitle(e.target.value)} /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="busy-start">{"\u5f00\u59cb"}</Label><Input id="busy-start" type="datetime-local" min="2000-01-01T00:00" max="2100-12-31T23:59" value={busyStart} onChange={(e) => setBusyStart(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="busy-end">{"\u7ed3\u675f"}</Label><Input id="busy-end" type="datetime-local" min="2000-01-01T00:00" max="2100-12-31T23:59" value={busyEnd} onChange={(e) => setBusyEnd(e.target.value)} /></div></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{"\u53d6\u6d88"}</Button><Button type="button" onClick={handleAddBusy} disabled={isPending || !busyStart || !busyEnd}>{isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{"\u6b63\u5728\u4fdd\u5b58..."}</> : "\u4fdd\u5b58"}</Button></DialogFooter></DialogContent></Dialog>
        </div>
    );
}

function toDateTimeInputValue(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
