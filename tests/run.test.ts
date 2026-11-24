// tests/run.test.ts — the run palette's pure surface: the Tab tail
// short-circuit rule and the descend cap constant. The side-effect-
// prone paths (rofi, terminal spawns, dunstify) are deliberately NOT
// exercised here: tests must never open windows (the 2026-11-16
// nested-alacritty loop). The completion DATA source has its own
// suite (tests/completions.test.ts over lib/completions).

import { describe, expect, test } from "bun:test";

import { tabShouldSubmit, tabTailComplete } from "../src/commands/run";
import { getCandidates, registerCompletions } from "../src/lib/completions";

// A fixed registry slice for the candidates walk (registerCompletions
// MERGES into the same map the CLI fills at boot — namespaced names
// avoid clashing with the real verbs when suites share a process).
registerCompletions([
    { name: "test-jump", description: "test-jump <south|forward>" },
    {
        name: "test-float",
        description: "test-float <yank|focus|unfocus>",
        options: { wid: {}, target: {} },
    },
] as never);

describe("tabShouldSubmit (the Tab resolution rule)", () => {
    const CURRENT = ["yank", "focus", "--wid", "--target"];

    test("a mode token at the verb level submits (never loops)", () => {
        expect(tabShouldSubmit("focus", 1, CURRENT, ["--wid", "--target"]))
            .toBeTrue();
    });

    test("a mode token at the ROOT level descends (the drill)", () => {
        expect(tabShouldSubmit("float", 0, ["float", "jump"], ["yank"]))
            .toBeFalse();
    });

    test("a re-offered flag still submits (the tail rule)", () => {
        expect(tabShouldSubmit("--wid", 1, CURRENT, ["--wid", "--target"]))
            .toBeTrue();
    });

    test("typed text with no entry never submits", () => {
        expect(tabShouldSubmit("yankk", 1, CURRENT, [])).toBeFalse();
    });

    test("an empty selection never submits", () => {
        expect(tabShouldSubmit("", 1, CURRENT, [])).toBeFalse();
    });
});

describe("tabTailComplete", () => {
    test("the tail already among the next completions short-circuits", () => {
        expect(tabTailComplete("focus", ["focus", "yank"])).toBeTrue();
        expect(tabTailComplete("left", ["--cycle", "left", "down"])).toBeTrue();
    });

    test("a genuinely deeper token still descends", () => {
        expect(tabTailComplete("frame", ["left", "down", "right"])).toBeFalse();
    });

    test("an empty tail never short-circuits", () => {
        expect(tabTailComplete("", ["focus"])).toBeFalse();
    });
});

describe("getCandidates (the palette's data source)", () => {
    test("root: the verb names", () => {
        expect(getCandidates([], "")).toContain("test-jump");
    });

    test("verb level: mode tokens then flags", () => {
        expect(getCandidates(["test-float"], "")).toEqual([
            "yank", "focus", "unfocus", "--wid", "--target",
        ]);
    });

    test("mode consumed: flags only", () => {
        expect(getCandidates(["test-float", "yank"], ""))
            .toEqual(["--wid", "--target"]);
    });

    test("prefix filtering at every level", () => {
        expect(getCandidates(["test-float"], "f")).toEqual(["focus", "unfocus"]
            .filter((t) => t.startsWith("f")));
        expect(getCandidates([], "test-")).toContain("test-jump");
    });

    test("an unknown verb offers nothing", () => {
        expect(getCandidates(["nope"], "")).toEqual([]);
    });
});
