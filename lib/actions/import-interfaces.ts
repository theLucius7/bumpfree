"use client";
import {
  action,
  api,
  type AdminSettingsData,
  type SchedulesData,
} from "@/lib/api";
export const getAllImportInterfaces = async () =>
  (await api<AdminSettingsData>("data/admin-settings")).importInterfaces;
export const getEnabledScheduleImportInterfaces = async () =>
  (await api<SchedulesData>("data/schedules")).importInterfaces;
export const resetImportInterfacesToDefaults = () =>
  action("resetImportInterfacesToDefaults");
export const updateImportInterface = (form: FormData) =>
  action("updateImportInterface", form);
export const deleteCustomImportInterface = (id: string) =>
  action("deleteCustomImportInterface", id);
export async function uploadCustomImportInterface(form: FormData) {
  const file = form.get("manifest");
  if (!(file instanceof File) || file.size > 102400)
    return { error: "请选择不超过100KB的JSON清单" };
  try {
    return action(
      "uploadCustomImportInterface",
      JSON.parse(await file.text()),
      file.name,
    );
  } catch {
    return { error: "清单不是有效JSON" };
  }
}
