// tests/verify.test.ts — the release gate's PURE core (lib/verify):
// tag parsing, the previous-major boundary, the minor-line window and
// the registry coverage decision. The verb half (commands/verify.ts)
// owns git/bun; nothing here spawns.

import { describe, expect, test } from "bun:test";
import {
    gateFails,
    minorsSince,
    parseTag,
    previousMajorBoundary,
    sinceLine,
    verifyMinors,
    type BehaviorEntry,
} from "../src/lib/verify.js";

const TAGS = [
    "v0.1.1",
    "v1.1.1", "v1.2.1", "v1.5.0", "v1.6.0", "v1.6.1",
    "v1.20.1", "v1.21.0",
];
const CUR = parseTag("v1.20.1")!;

describe("verify: tag arithmetic", () => {
    test("parseTag tolerates the v prefix and rejects garbage", () => {
        expect(parseTag("v1.20.1")).toEqual({ major: 1, minor: 20, patch: 1 });
        expect(parseTag("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
        expect(parseTag("v1.2")).toBeNull();
        expect(parseTag("main")).toBeNull();
    });

    test("previousMajorBoundary: the highest tag below the current major", () => {
        const b = previousMajorBoundary(TAGS, CUR)!;
        expect(b.tag).toBe("v0.1.1");
        expect(previousMajorBoundary(["v1.6.1"], CUR)).toBeNull();
    });

    test("minorsSince: distinct minor lines in (boundary, current], first tag each", () => {
        const b = previousMajorBoundary(TAGS, CUR)!;
        const minors = minorsSince(TAGS, CUR, b);
        expect(minors.map((m) => m.line)).toEqual(["v1.1", "v1.2", "v1.5", "v1.6", "v1.20"]);
        expect(minors[2].firstTag).toBe("v1.5.0");
    });

    test("minorsSince: the WIP tag ahead of package.json is OUT of the window", () => {
        const b = previousMajorBoundary(TAGS, CUR)!;
        const minors = minorsSince(TAGS, CUR, b);
        expect(minors.some((m) => m.line === "v1.21")).toBe(false);
    });

    test("minorsSince: the CURRENT untagged minor is still a window line", () => {
        // no v1.20.* tags at all (package.json is ahead of git) — the
        // in-flight minor line synthesizes from package.json
        const tags = ["v0.1.1", "v1.1.1", "v1.6.1"];
        const b = previousMajorBoundary(tags, CUR)!;
        const minors = minorsSince(tags, CUR, b);
        const line = minors.find((m) => m.line === "v1.20");
        expect(line).toBeDefined();
        expect(line!.firstTag).toContain("unreleased");
    });

    test("sinceLine: a behavior maps to its minor line", () => {
        expect(sinceLine("v1.6.0")).toBe("v1.6");
        expect(sinceLine("garbage")).toBeNull();
    });
});

describe("verify: registry coverage", () => {
    const behaviors: BehaviorEntry[] = [
        { id: "a", since: "v1.2.1", example: "example a", guard: "tests/rigor/behaviors.test.ts" },
        { id: "b", since: "v1.5.0", example: "example b", guard: "tests/rigor/behaviors.test.ts" },
        { id: "lost", since: "v1.6.0", example: "example c", guard: "tests/rigor/gone.test.ts" },
    ];
    const minors = minorsSince(TAGS, CUR, previousMajorBoundary(TAGS, CUR)!);

    test("verifyMinors groups behaviors per minor line and flags missing guards", () => {
        const rows = verifyMinors(minors, behaviors, () => true);
        const v12 = rows.find((r) => r.minor === "v1.2")!;
        expect(v12.unrecorded).toBe(false);
        expect(v12.behaviors.map((b) => b.id)).toEqual(["a"]);
        const v16 = rows.find((r) => r.minor === "v1.6")!;
        expect(v16.missingGuards).toEqual([]); // guard exists when the probe says so
        const v11 = rows.find((r) => r.minor === "v1.1")!;
        expect(v11.unrecorded).toBe(true);
    });

    test("a behavior whose guard file vanished is UNVERIFIED and fails the gate", () => {
        const rows = verifyMinors(minors, behaviors, (g) => !g.includes("gone"));
        const v16 = rows.find((r) => r.minor === "v1.6")!;
        expect(v16.missingGuards).toEqual(["tests/rigor/gone.test.ts"]);
        expect(gateFails(rows, false)).toBe(true);
    });

    test("unrecorded minors fail only under --strict", () => {
        const rows = verifyMinors(minors, behaviors, () => true);
        expect(gateFails(rows, false)).toBe(false);
        expect(gateFails(rows, true)).toBe(true);
    });
});
