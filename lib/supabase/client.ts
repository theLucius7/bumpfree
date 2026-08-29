import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export function createClient() {
    const { url, publishableKey } = getPublicSupabaseConfig();
    return createBrowserClient(url, publishableKey);
}
