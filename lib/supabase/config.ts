export interface PublicSupabaseConfig {
    url: string;
    publishableKey: string;
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (!url || !publishableKey) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and configure your Supabase project."
        );
    }

    if (isPrivilegedSupabaseKey(publishableKey)) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY must be a publishable/anon key, never a service-role or secret key.");
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS outside local development.");
    }

    return { url: parsedUrl.origin, publishableKey };
}

function isPrivilegedSupabaseKey(key: string): boolean {
    if (key.startsWith("sb_secret_")) return true;

    const payload = key.split(".")[1];
    if (!payload) return false;

    try {
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        const claims = JSON.parse(atob(padded)) as { role?: unknown };
        return claims.role === "service_role";
    } catch {
        return false;
    }
}
