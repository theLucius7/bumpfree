// Database types matching the Supabase schema

export interface Profile {
    id: string;
    display_name: string | null;
    role: "user" | "superadmin";
    room_quota: number;
    schedule_quota: number;
    created_at: string;
}

export interface AdminUser {
    id: string;
    display_name: string;
    email: string | null;
    role: "user" | "superadmin";
    room_quota: number;
    schedule_quota: number;
    created_at: string;
}

export interface Schedule {
    id: string;
    user_id: string;
    semester_tag: string;
    school: string | null;
    start_date: string;
    max_weeks: number;
    is_active: boolean;
    wakeup_raw: unknown | null;
    imported_at: string;
}

export interface Course {
    id: string;
    schedule_id: string;
    user_id: string;
    name: string;
    room: string | null;
    teacher: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    start_week: number;
    end_week: number;
    color: string | null;
    created_at: string;
}

export interface BusyBlock {
    id: string;
    user_id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    note: string | null;
    source: "manual" | "reschedule";
    created_at: string;
}

export interface MalaysiaHoliday {
    id: string;
    date: string;
    localName: string;
    name: string;
}

export interface Room {
    id: string;
    admin_id: string;
    name: string;
    description: string | null;
    expires_at: string | null;
    is_public: boolean;
    created_at: string;
}

export interface RoomMember {
    room_id: string;
    user_id: string;
    color: string;
    joined_at: string;
    profile?: Profile;
}

export interface Invitation {
    id: string;
    room_id: string;
    invitee_id: string;
    inviter_id: string;
    status: "pending" | "accepted" | "declined";
    created_at: string;
    room?: Room;
    inviter?: Profile;
}

export type CalendarEventKind = "course" | "busy" | "holiday";

export interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: {
        kind: CalendarEventKind;
        userId: string;
        displayName: string;
        color: string;
        courseName: string;
        room: string | null;
        teacher: string | null;
        note?: string | null;
    };
}
