import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });
    const { url, publishableKey } = getPublicSupabaseConfig();

    const supabase = createServerClient(url, publishableKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                supabaseResponse = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) =>
                    supabaseResponse.cookies.set(name, value, options)
                );
            },
        },
    });

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;

    if (!user && (path.startsWith("/dashboard") || path.startsWith("/admin"))) {
        return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    if (user && path.startsWith("/admin")) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
        if (!profile || profile.role !== "superadmin") {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
    }

    if (user && (path === "/auth/login" || path === "/auth/register")) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
