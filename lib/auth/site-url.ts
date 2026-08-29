export function getSiteUrl(): string | null {
    const rawUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!rawUrl) return null;

    try {
        const url = new URL(rawUrl);
        const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (url.protocol !== "https:" && !(isLocalhost && url.protocol === "http:")) return null;
        return url.origin;
    } catch {
        return null;
    }
}

export function getAuthCallbackUrl(nextPath?: string): string | null {
    const siteUrl = getSiteUrl();
    if (!siteUrl) return null;

    const callbackUrl = new URL("/auth/callback", siteUrl);
    if (nextPath) callbackUrl.searchParams.set("next", nextPath);
    return callbackUrl.toString();
}
