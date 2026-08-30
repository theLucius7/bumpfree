"use client";
import { action } from "@/lib/api";
import { parseRescheduleNotice } from "@/lib/utils/rescheduleNotice";
export const addBusyBlock = (input: {
  title: string;
  startsAt: string;
  endsAt: string;
  note?: string;
  roomId?: string;
}) => action("addBusyBlock", input);
export const deleteBusyBlock = (id: string, roomId?: string) =>
  action("deleteBusyBlock", id, roomId);
export async function importRescheduleNotice(text: string) {
  try {
    const notice = parseRescheduleNotice(text);
    return action("importRescheduleNotice", notice);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "解析失败" };
  }
}
