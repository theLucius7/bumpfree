"use client";
import { action, api, type AdminSettingsData } from "@/lib/api";
export interface ManualScheduleSubmission {
  id: string;
  user_id: string;
  status: "pending" | "processing" | "done" | "rejected";
  text_content: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  profile?: {
    display_name: string | null;
  } | null;
}

export const getManualScheduleSubmissions = async () =>
  (await api<AdminSettingsData>("data/admin-settings")).manualSubmissions;
export const updateManualScheduleSubmission = (form: FormData) =>
  action("updateManualScheduleSubmission", form);
