import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/auth/site-url";

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const siteUrl = getSiteUrl();
    if (!siteUrl) return NextResponse.json({ error: "Site URL is not configured" }, { status: 500 });
    const code = requestUrl.searchParams.get("code");
    const next = safeInternalPath(requestUrl.searchParams.get("next"), siteUrl);

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(new URL(next, siteUrl));
        }
    }

    return NextResponse.redirect(new URL("/auth/login", siteUrl));
}

function safeInternalPath(value: string | null, origin: string): string {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
        return "/dashboard";
    }

    try {
        const url = new URL(value, origin);
        if (url.origin !== origin) return "/dashboard";
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return "/dashboard";
    }
}
