"use client";
import { action, api, type InvitationsData } from "@/lib/api";
export const getMyInvitations = async () =>
  (await api<InvitationsData>("data/invitations")).invitations;
export const acceptInvitation = (id: string) => action("acceptInvitation", id);
export const declineInvitation = (id: string) =>
  action("declineInvitation", id);
