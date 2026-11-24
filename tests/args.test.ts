// tests/args.test.ts — the declarative argument layer, tested at the
// string level: spec + argv in, values/reason out. The interactive
// prompt chain is asserted on its BACKEND SELECTION (pure), not on the
// UI itself.

import { describe, expect, test } from "bun:test";

import {
    argFailReason,
    resolveTails,
    promptBackends,
    type ArgSpec,
} from "../src/lib/args";

const SPECS: readonly ArgSpec[] = [
    { name: "object", description: "what to allocate", required: true },
    { name: "name", description: "the tagspace name" },
];

describe("resolveTails (pure, string level)", () => {
    test("tail positionals pair with the specs in order", () => {
        const { values, missing } = resolveTails(SPECS, ["tagspace", "notes"]);
        expect(values).toEqual({ object: "tagspace", name: "notes" });
        expect(missing).toBeNull();
    });

    test("a required tail left out is reported by name", () => {
        const { missing } = resolveTails(SPECS, []);
        expect(missing).toBe("object");
    });

    test("an optional tail left out is absent (no default)", () => {
        const { values, missing } = resolveTails(SPECS, ["tagspace"]);
        expect(values).toEqual({ object: "tagspace" });
        expect(missing).toBeNull();
        expect("name" in values).toBe(false);
    });

    test("a default fills an omitted optional", () => {
        const specs: readonly ArgSpec[] = [
            { name: "object", description: "", required: true },
            { name: "name", description: "", default: "scratch" },
        ];
        const { values } = resolveTails(specs, ["tagspace"]);
        expect(values.name).toBe("scratch");
    });

    test("the supplied value wins over the default", () => {
        const specs: readonly ArgSpec[] = [
            { name: "name", description: "", default: "scratch" },
        ];
        const { values } = resolveTails(specs, ["notes"]);
        expect(values.name).toBe("notes");
    });

    test("the fail reason has the orchestration shape", () => {
        expect(argFailReason("name", "add tagspace")).toBe(
            "argument name is required for add tagspace",
        );
    });
});

describe("promptBackends (the resilient query chain)", () => {
    test("rofi first when a display and the binary exist", () => {
        expect(promptBackends({ display: ":0", rofiOnPath: true, wmSpawnPossible: true }))
            .toEqual(["rofi", "terminal"]);
    });

    test("no display: straight to the urgent terminal", () => {
        expect(promptBackends({ display: undefined, rofiOnPath: true, wmSpawnPossible: true }))
            .toEqual(["terminal"]);
    });

    test("no rofi binary: straight to the urgent terminal", () => {
        expect(promptBackends({ display: ":0", rofiOnPath: false, wmSpawnPossible: true }))
            .toEqual(["terminal"]);
    });

    test("noPrompt (automation): no backends — the caller emits the fail shape", () => {
        expect(promptBackends({ display: ":0", rofiOnPath: true, wmSpawnPossible: true, noPrompt: true }))
            .toEqual([]);
    });
});
