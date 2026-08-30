"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useResource, type Me } from "@/lib/api";
export function useRequireAuth(admin = false) {
  const state = useResource<Me>("me");
  const router = useRouter();
  useEffect(() => {
    if (state.data && !state.data.user) router.replace("/auth/login/");
    else if (
      admin &&
      state.data?.user &&
      state.data.profile?.role !== "superadmin"
    )
      router.replace("/dashboard/");
  }, [state.data, router, admin]);
  return state;
}
