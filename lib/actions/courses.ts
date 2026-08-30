"use client";
import { action, api, type SchedulesData } from "@/lib/api";
import {
  parseTextSchedule,
  type ParsedTextSchedule,
  type TextScheduleImportMode,
} from "@/lib/utils/textSchedule";
export async function importTextSchedule(
  text: string,
  mode?: TextScheduleImportMode,
) {
  try {
    const parsed = parseTextSchedule(text);
    return action("importParsedSchedule", {
      ...parsed,
      importMode: mode || parsed.importMode,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "解析失败" };
  }
}
export const importIcsSchedule = (parsed: ParsedTextSchedule) =>
  action("importParsedSchedule", parsed);
export const addManualCourse = (form: FormData) =>
  action("addManualCourse", form);
export const updateCourse = (form: FormData) => action("updateCourse", form);
export const deleteCourse = (id: string) => action("deleteCourse", id);
export const setActiveSchedule = (id: string) =>
  action("setActiveSchedule", id);
export const deleteSchedule = (id: string) => action("deleteSchedule", id);
export const getMySchedules = async () =>
  (await api<SchedulesData>("data/schedules")).schedules;
