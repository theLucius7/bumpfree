import "server-only";

import type { NextRequest } from "next/server";
import { getSiteUrl } from "@/lib/auth/site-url";

export function hasTrustedRequestOrigin(request: NextRequest): boolean {
    const origin = request.headers.get("origin");
    if (!origin) {
        return request.headers.get("sec-fetch-site") !== "cross-site";
    }

    const siteUrl = getSiteUrl();
    if (!siteUrl) return false;

    try {
        return new URL(origin).origin === siteUrl;
    } catch {
        return false;
    }
}
