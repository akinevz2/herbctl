// tests/rigor/behaviors.test.ts — the OBSERVED-BEHAVIOUR guards the
// verify verb's registry (behaviors.json, same directory) points at.
// One test per registry id: each pins the example of hereupon
// observed behaviour that motivated it (source-level — no live WM,
// the source-guards shape). When a behavior's guard lives here, the
// `herbctl verify` release gate counts the minor line as verified.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const src = (f: string) => readFileSync(join(ROOT, "src", f), "utf8");

describe("rigor: observed behaviors (the verify registry)", () => {
    // the registry itself must parse and reference EXISTING guards
    test("registry: every behavior names this file as its guard", () => {
        const reg = JSON.parse(
            readFileSync(join(import.meta.dir, "behaviors.json"), "utf8"),
        );
        expect(Array.isArray(reg)).toBe(true);
        for (const b of reg) {
            expect(b.id).toMatch(/^[\w-]+$/);
            expect(b.since).toMatch(/^v\d+\.\d+\.\d+$/);
            expect(b.guard.endsWith("behaviors.test.ts")).toBe(true);
            expect(b.example.length).toBeGreaterThan(20);
        }
    });

    // jump-required-tail-prompts
    test("jump: the direction is a DECLARED required tail with the four machines as entries", () => {
        const s = src("commands/jump.ts");
        expect(s).toMatch(/resolveVerbArgs\("jump"/);
        expect(s).toMatch(/required:\s*true/);
        // the entries come from the MACHINES keys (the four machines),
        // not a hand-copied list that can drift
        expect(s).toMatch(/entries:\s*DIRECTIONS/);
        // refusal is the doctrine fail shape (exit 2 via ARG_EXIT),
        // never a thrown usage Error (the exit-1 JSON notification)
        expect(s).toMatch(/process\.exit\(ARG_EXIT\)/);
        expect(s).not.toMatch(/throw new Error\(\s*[`"']Usage: herbctl jump/);
    });

    // terminal-bind-focus
    test("terminal: --bind chains a pid-matched herbstclient bring post-attach", () => {
        const cmd = src("commands/terminal.ts");
        const lib = src("lib/terminal.ts");
        // the flag is declared and threaded
        expect(cmd).toMatch(/bind:\s*option\(/);
        expect(cmd).toMatch(/bind:\s*flags\.bind/);
        // the watcher brings the pid-matched client (focus + raise)
        expect(lib).toMatch(/bindOnAttach/);
        expect(lib).toMatch(/hc\("bring",\s*w\)/);
    });

    // palette-failure-body-markup-escaped
    test("open: submitLine escapes the stderr excerpt before the dunst body", () => {
        const s = src("commands/open.ts");
        // the excerpt line pipes through the shell-side escaper
        expect(s).toMatch(/head -c 500 \| sed/);
        expect(s).toMatch(/&amp;/);
    });
});
