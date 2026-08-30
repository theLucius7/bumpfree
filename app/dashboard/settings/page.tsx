"use client";
import { useResource } from "@/lib/api";
import { RequestState } from "@/components/RequestState";
import { SettingsClient } from "@/components/dashboard/SettingsClient";

export default function SettingsPage() {
  const { data, error } = useResource<import("@/lib/api").Me>("me");
  if (!data?.user) return <RequestState error={error} />;
  const { user, profile } = data;
  return (
    <SettingsClient
      initialDisplayName={profile?.display_name || ""}
      initialEmail={user.email || ""}
    />
  );
}
