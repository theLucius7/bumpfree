import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/current-user";
import { SettingsClient } from "@/components/dashboard/SettingsClient";

export default async function SettingsPage() {
    const { user, profile } = await getCurrentUserProfile();

    if (!user) redirect("/auth/login");

    return (
        <SettingsClient
            initialDisplayName={profile?.display_name || ""}
            initialEmail={user.email || ""}
        />
    );
}
