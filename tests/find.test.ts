// tests/find.test.ts — the find machine's pure surface: the four-fact
// entry line, the duplicate-title wid disambiguation, and the
// selection resolution. (The rofi loop and the herbstclient calls are
// the fail-soft IO layer — never touched in tests.)

import { describe, expect, test } from "bun:test";

import { entryLines, entryText, selectionWid, type FindEntry } from "../src/lib/find";

const E = (wid: string, title: string, tag = "work", min = false,
           floating = false): FindEntry =>
    ({ wid, title, tag, min, floating });

describe("entryText (the four facts)", () => {
    test("title · tag, with the state markers only when true", () => {
        expect(entryText(E("0x1", "Editor")))
            .toBe("Editor · work");
        expect(entryText(E("0x1", "Editor", "work", true, true)))
            .toBe("Editor · work · minimized · floating");
        expect(entryText(E("0x1", "Editor", "work", false, true)))
            .toBe("Editor · work · floating");
    });
});

describe("entryLines / selectionWid", () => {
    test("a unique row renders clean and resolves to its window", () => {
        const entries = [E("0x3", "Terminal")];
        const [line] = entryLines(entries);
        expect(line).toBe("Terminal · work");
        expect(selectionWid(line, entries)).toBe("0x3");
    });

    test("colliding titles are wid-suffixed; each resolves to ITS wid", () => {
        const entries = [E("0x1", "Editor"), E("0x2", "Editor")];
        const lines = entryLines(entries);
        expect(lines).toEqual(["Editor · work (0x1)", "Editor · work (0x2)"]);
        expect(selectionWid(lines[1], entries)).toBe("0x2");
        expect(selectionWid(lines[0], entries)).toBe("0x1");
    });

    test("typed text with no exact entry is refused (null)", () => {
        const entries = [E("0x3", "Terminal")];
        expect(selectionWid("edit", entries)).toBeNull();
        expect(selectionWid("Terminal · work (0x9)", entries)).toBeNull();
    });
});
