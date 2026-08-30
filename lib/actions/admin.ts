"use client";
import { action, api, type AdminData } from "@/lib/api";
export const getAllUsers = async () =>
  (await api<AdminData>("data/admin")).users;
export const getGlobalStats = async () =>
  (await api<AdminData>("data/admin")).stats;
export const updateUserQuota = (form: FormData) =>
  action("updateUserQuota", form);
export const updateUserScheduleQuota = (form: FormData) =>
  action("updateUserScheduleQuota", form);
export const toggleUserRole = (id: string) => action("toggleUserRole", id);
export const bulkInviteUsers = (form: FormData) =>
  action("bulkInviteUsers", form);
