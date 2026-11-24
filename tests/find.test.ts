// tests/find.test.ts — the find machine's pure surface: the
// duplicate-title wid disambiguation and the selection resolution.
// (The rofi loop and the herbstclient calls are the fail-soft
// spawn layer — covered by the mock-bin harness in the other suites.)

import { describe, expect, test } from "bun:test";

import { selectionWid } from "../src/lib/find";

const ENTRIES = [
    { text: "Editor", wid: "0x1" },
    { text: "Editor (0x2)", wid: "0x2" },
    { text: "Terminal", wid: "0x3" },
];

describe("selectionWid", () => {
    test("a wid-suffixed duplicate resolves to ITS wid", () => {
        expect(selectionWid("Editor (0x2)", ENTRIES)).toBe("0x2");
    });

    test("a plain title resolves to the first occurrence", () => {
        expect(selectionWid("Editor", ENTRIES)).toBe("0x1");
        expect(selectionWid("Terminal", ENTRIES)).toBe("0x3");
    });

    test("typed text with no exact entry is refused (null)", () => {
        expect(selectionWid("edit", ENTRIES)).toBeNull();
        expect(selectionWid("Editor (0x9)", ENTRIES)).toBeNull();
    });
});
