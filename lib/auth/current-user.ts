import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getCurrentUserProfile = cache(async () => {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { user: null, profile: null };

    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    return { user, profile };
});
