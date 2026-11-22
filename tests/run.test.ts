// tests/run.test.ts — the run palette's help parsing (pure function)
// and the descend cap. The side-effect-prone paths (rofi, terminal
// spawns, dunstify) are deliberately NOT exercised here: tests must
// never open windows (the 2026-11-16 nested-alacritty loop).

import { describe, expect, test } from "bun:test";

import { parseHelpCompletions } from "../src/commands/run";

describe("parseHelpCompletions", () => {
    test("extracts exactly-2-space-indented subcommands", () => {
        const text = [
            "herbctl v1.7.0",
            "",
            "Commands:",
            "  spawn  Spawn client with rule",
            "  open   Browse directories",
            "  run    completion palette",
        ].join("\n");
        expect(parseHelpCompletions(text)).toEqual(["spawn", "open", "run"]);
    });

    test("extracts long flags from entry lines", () => {
        const text = [
            "Usage: herbctl terminal [options]",
            "",
            "Options:",
            "  --floating, -f     float the terminal once it attaches",
            "  --no-distract, -n  no focus steal",
        ].join("\n");
        expect(parseHelpCompletions(text))
            .toEqual(["--floating", "--no-distract"]);
    });

    test("ignores deeper-indented wrapped description prose", () => {
        // The '--force'/'files' noise: wrapped continuation lines of
        // description columns are NOT section entries.
        const text = [
            "Commands:",
            "  reload  herbstclient reload + reload_theme",
            "          --force (when the helper exists)",
            "  open    Browse directories: open a terminal, view",
            "          files",
        ].join("\n");
        expect(parseHelpCompletions(text)).toEqual(["reload", "open"]);
    });

    test("ignores serialized-JSON help (a single line)", () => {
        const text = '{"ok": true, "data": { "text": "Commands:\\n  spawn ...\\n" }}';
        expect(parseHelpCompletions(text)).toEqual([]);
    });

    test("extracts <a|b|c> enum slots from usage lines", () => {
        const text = [
            "Usage: herbctl frame <left|down|right|bottom|new|explode> [--cycle]",
            "",
            "Options:",
            "  --cycle, -c  the cycle variant of the direction",
        ].join("\n");
        expect(parseHelpCompletions(text)).toEqual([
            "left", "down", "right", "bottom", "new", "explode", "--cycle",
        ]);
    });

    test("filters stoplist headings", () => {
        const text = [
            "Commands:",
            "  usage      not a subcommand",
            "  options    not a subcommand",
            "  spawn      real one",
        ].join("\n");
        expect(parseHelpCompletions(text)).toEqual(["spawn"]);
    });
});
