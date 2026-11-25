// tests/completions.test.ts — the completions surface: the enum-token
// derivation from usage descriptions (lib/completions) and the shell
// delegate scripts' contract (they must unwrap --internal's compact
// JSON with grep/tr only — no jq).

import { describe, expect, test } from "bun:test";

import { enumTokens, getTree, registerCompletions } from "../src/lib/completions";
import centerCmd from "../src/lib/center.js";
import {
    bashScript,
    fishScript,
    zshScript,
} from "../src/commands/completions";

describe("enumTokens", () => {
    test("angle-bracket enums are mode tokens (hyphens included)", () => {
        expect(enumTokens("remove <or-remove|xkill>")).toEqual([
            "or-remove", "xkill",
        ]);
    });

    test("bracket enums too (the frame shape)", () => {
        expect(enumTokens("frame [left|down|right|bottom|explode]")).toEqual([
            "left", "down", "right", "bottom", "explode",
        ]);
    });

    test("placeholders are NOT completions", () => {
        expect(enumTokens("find <string> — a tag, else client titles"))
            .toEqual([]);
        expect(enumTokens("tag [name] — enter, allocating when missing"))
            .toEqual([]);
    });

    test("section headings are never tokens", () => {
        expect(enumTokens("Commands:\n  usage      not a subcommand"))
            .toEqual([]);
    });
});

describe("getTree", () => {
    test("carries name/version and the registered commands", () => {
        // The registry is boot-filled by index.ts; a test registers a
        // real verb definition the same way index.ts does (the
        // reparented top-level geometry verb).
        registerCompletions([centerCmd as never]);
        const tree = getTree();
        expect(tree.name).toBe("herbctl");
        expect(tree.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(tree.commands.length).toBeGreaterThan(0);
        const center = tree.commands.find((c) => c.name === "center");
        expect(center?.flags).toContain("--wid");
        expect(center?.flags).toContain("--floating-only");
    });
});

describe("delegate scripts", () => {
    test("all three delegate through completions --internal", () => {
        for (const script of [bashScript(), zshScript(), fishScript()]) {
            expect(script).toContain("herbctl completions --internal");
        }
    });

    test("bash unwraps compact JSON with grep/tr (no jq)", () => {
        expect(bashScript()).toContain('grep -o \'"[^"]*"\'');
        expect(bashScript()).toContain("complete -F _herbctl_completions herbctl");
    });

    test("zsh declares compdef; fish declares complete -c", () => {
        expect(zshScript()).toContain("compdef _herbctl herbctl");
        expect(fishScript()).toContain("complete -c herbctl");
    });
});
