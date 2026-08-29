// Member color palette for room calendars.
// Keep this small and deliberate: one stable color per person,
// and enough hue separation for side-by-side calendar blocks.

export const MEMBER_COLORS = [
    "#2563eb", // Blue
    "#059669", // Emerald
    "#b45309", // Amber
    "#7c3aed", // Violet
    "#0891b2", // Cyan
    "#65a30d", // Olive
    "#c2410c", // Burnt orange
    "#475569", // Slate
];

/**
 * Get a color for a member based on their user ID.
 * Assigns deterministically by hashing the userId.
 */
export function getColorForUser(userId: string, palette = MEMBER_COLORS): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
    }
    return palette[Math.abs(hash) % palette.length];
}

export function isMemberColor(color: string | null | undefined): color is string {
    return typeof color === "string" && MEMBER_COLORS.includes(color.toLowerCase());
}

/**
 * Get a color that's not yet used in a room (for new member assignment).
 */
export function getNextAvailableColor(usedColors: string[]): string {
    const normalizedUsedColors = usedColors.map((color) => color.toLowerCase());
    for (const color of MEMBER_COLORS) {
        if (!normalizedUsedColors.includes(color)) return color;
    }
    // Fallback: cycle from beginning
    return MEMBER_COLORS[usedColors.length % MEMBER_COLORS.length];
}

/**
 * Use persisted member colors only when they belong to the current palette.
 * Legacy or retired colors are remapped at render time.
 */
export function getDisplayMemberColor(userId: string, storedColor: string | null | undefined, usedColors: string[]): string {
    const color = storedColor?.toLowerCase();
    if (isMemberColor(color) && !usedColors.includes(color)) return color;

    const preferredColor = getColorForUser(userId);
    if (!usedColors.includes(preferredColor)) return preferredColor;

    return getNextAvailableColor(usedColors);
}

/**
 * Convert hex color to rgba with opacity.
 */
export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
