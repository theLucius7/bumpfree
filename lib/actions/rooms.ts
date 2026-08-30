"use client";
import { action, api, type ManagedRoom } from "@/lib/api";
import type { RoomMember } from "@/lib/types";
export const createRoom = (form: FormData) => action("createRoom", form);
export const updateRoom = (
  id: string,
  updates: {
    name?: string;
    description?: string | null;
    expiresAt?: string | null;
    isPublic?: boolean;
  },
) => action("updateRoom", id, updates);
export const deleteRoom = (id: string) => action("deleteRoom", id);
export const inviteUserToRoom = (id: string, userId: string) =>
  action("inviteUserToRoom", id, userId);
export const removeRoomMember = (id: string, userId: string) =>
  action("removeRoomMember", id, userId);
export const getMyRooms = async () =>
  (await api<{ rooms: ManagedRoom[] }>("data/rooms")).rooms;
export const searchUsers = async (query: string) =>
  (
    await api<{ users: { id: string; display_name: string }[] }>(
      "users/search?q=" + encodeURIComponent(query),
    )
  ).users;
export const getRoomMembers = async (id: string) =>
  (await api<{ members: RoomMember[] }>("rooms/" + id + "/members")).members;
