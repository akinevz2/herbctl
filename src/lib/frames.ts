// src/lib/frames.ts — flat frame index helpers (migrated with the
// geometry machines from polyframes; the frameSelection half stays
// behind — it is polyframes UI machinery).

/**
 * Convert a FLAT frame index ("0", "00", "010") to the dotted object
 * path segment ("0", "0.0", "0.1.0"). Each digit is one child choice;
 * the object path inserts a dot between every digit.
 */
export function flatToDotted(flat: string): string {
    return String(flat)
        .split("")
        .filter((d) => /\d/.test(d))
        .join(".");
}
