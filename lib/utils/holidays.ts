import type { MalaysiaHoliday } from "@/lib/types";

interface NagerHoliday {
    date: string;
    localName: string;
    name: string;
    countryCode: string;
}

export async function getMalaysiaPublicHolidays(years: number[]): Promise<MalaysiaHoliday[]> {
    const uniqueYears = Array.from(new Set(years.filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100))).sort();
    const lists = await Promise.all(uniqueYears.map(fetchYear));
    return lists.flat().sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchYear(year: number): Promise<MalaysiaHoliday[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/MY`, {
            next: { revalidate: 86400 },
            signal: controller.signal,
        });
        if (!response.ok) return [];

        const contentLength = Number(response.headers.get("content-length") || 0);
        if (Number.isFinite(contentLength) && contentLength > 256_000) return [];

        const text = await response.text();
        if (!text.trim() || text.length > 256_000) return [];

        const data = JSON.parse(text) as unknown;
        if (!Array.isArray(data) || data.length > 100) return [];

        return data
            .filter(isNagerHoliday)
            .filter((item) => item.countryCode === "MY")
            .map((item) => ({ id: `my-holiday-${item.date}`, date: item.date, localName: item.localName, name: item.name }));
    } catch {
        return [];
    } finally {
        clearTimeout(timeout);
    }
}

function isNagerHoliday(value: unknown): value is NagerHoliday {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<NagerHoliday>;
    return typeof item.date === "string"
        && isIsoDate(item.date)
        && typeof item.localName === "string"
        && item.localName.length <= 200
        && typeof item.name === "string"
        && item.name.length <= 200
        && typeof item.countryCode === "string";
}

function isIsoDate(value: string) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
