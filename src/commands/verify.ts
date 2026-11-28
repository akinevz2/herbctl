// src/commands/verify.ts — THE release gate:
//
//   herbctl verify [--since <tag>] [--strict] [--json]
//
// Before a MAJOR release: every MINOR revision rolled since the
// previous major release must be VERIFIED against examples of
// hereupon observed behaviour. The registry (tests/rigor/behaviors.json)
// records, per minor line, the observed examples and the rigor guard
// (tests/rigor/behaviors.test.ts) pinning each; verification =
// every minor's behaviors carry EXISTING guards and the guard suite
// PASSES at HEAD (bun test in the checkout).
//
// The pure half (lib/verify) owns the tag arithmetic — the previous
// major boundary is the HIGHEST tag below the current major line,
// and the window is (boundary, current]. A minor with no recorded
// behaviors verifies only without --strict (fail-open for the
// pre-registry history; a recorded behavior with a MISSING guard
// always fails the gate).
//
// Source-aware (like the source-guards tests): the checkout is
// resolved from the STOWED binary's realpath — dots/<pkg>/.local/
// share/herbctl — or the HERBCTL_CHECKOUT override; a run from
// `bun run src/index.ts` uses the source tree directly.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { version } from "../../package.json" with { type: "json" };
import {
    gateFails,
    minorsSince,
    parseTag,
    previousMajorBoundary,
    verifyMinors,
    type BehaviorEntry,
    type MinorVerification,
} from "../lib/verify.js";

/** The herbctl CHECKOUT (the git repo + tests/rigor): the stowed
 *  binary lives at dots/herbctl/.local/bin/herbctl, the checkout is
 *  its ../../share/herbctl. The dev-tree run (bun) already IS it. */
function checkout(): string | null {
    if (process.env.HERBCTL_CHECKOUT) return process.env.HERBCTL_CHECKOUT;
    try {
        const real = realpathSync(process.execPath);
        // .../dots/herbctl/.local/bin/herbctl -> .../bin/../share/herbctl
        if (real.includes("/.local/bin/")) {
            return realpathSync(join(dirname(real), "..", "share", "herbctl"));
        }
        return null; // an unbundled run outside the stow layout
    } catch {
        return null;
    }
}

/** git tag list of the checkout (null on any failure — the gate
 *  cannot verify what it cannot enumerate). */
function gitTags(dir: string): string[] | null {
    const proc = Bun.spawnSync(["git", "tag", "--sort=v:refname"], {
        cwd: dir,
        stdout: "pipe",
        stderr: "pipe",
    });
    if (proc.exitCode !== 0) return null;
    return proc.stdout.toString().split("\n").filter(Boolean);
}

export default defineCommand({
    name: "verify" as never,
    description:
        "release gate: verify every minor since the previous major against recorded observed behaviours",
    options: {
        since: option(z.string().optional(), {
            description: "override the boundary tag (default: the previous major's last release)",
        }),
        strict: option(z.boolean().default(false), {
            description: "also fail minors with NO recorded behaviors",
            short: "s",
            argumentKind: "flag",
        }),
        json: option(z.boolean().default(false), {
            description: "machine-readable report (the orchestration surface)",
            argumentKind: "flag",
        }),
    },
    handler: async ({ flags }) => {
        const dir = checkout();
        const cur = parseTag(`v${version}`);
        if (dir === null || !existsSync(dir)) {
            console.error("verify: no checkout resolved (set HERBCTL_CHECKOUT)");
            process.exit(1);
        }
        if (cur === null) {
            console.error(`verify: unparseable version ${version}`);
            process.exit(1);
        }
        const tags = gitTags(dir);
        if (tags === null) {
            console.error(`verify: git tag enumeration failed in ${dir}`);
            process.exit(1);
        }
        const boundary = flags.since
            ? (() => {
                const v = parseTag(flags.since);
                if (v === null) {
                    console.error(`verify: unparseable --since '${flags.since}'`);
                    process.exit(1);
                }
                return v;
            })()
            : previousMajorBoundary(tags, cur);

        const minors = minorsSince(tags, cur, boundary);
        const registryPath = join(dir, "tests", "rigor", "behaviors.json");
        let behaviors: BehaviorEntry[] = [];
        if (existsSync(registryPath)) {
            behaviors = JSON.parse(readFileSync(registryPath, "utf8"));
        }
        const rows: MinorVerification[] = verifyMinors(
            minors,
            behaviors,
            (g) => existsSync(join(dir, g)),
        );

        // run the guard suite ONCE (all guards live in tests/rigor;
        // one bun test pass verifies every recorded behavior at HEAD)
        let suiteRc: number | null = null;
        let suiteOut = "";
        const guards = [...new Set(behaviors.map((b) => b.guard))];
        if (guards.length > 0) {
            const run = Bun.spawnSync(["bun", "test", ...guards], {
                cwd: dir,
                stdout: "pipe",
                stderr: "pipe",
            });
            suiteRc = run.exitCode;
            suiteOut = run.stderr.toString() + run.stdout.toString();
        }

        const failed = suiteRc !== 0 || gateFails(rows, flags.strict);

        if (flags.json) {
            console.log(JSON.stringify({
                ok: !failed,
                boundary: boundary?.tag ?? null,
                current: `v${version}`,
                minors: rows.map((r) => ({
                    minor: r.minor,
                    behaviors: r.behaviors.map((b) => b.id),
                    missingGuards: r.missingGuards,
                    unrecorded: r.unrecorded,
                })),
                guardSuiteRc: suiteRc,
            }, null, 2));
        } else {
            console.log(`verify: v${version} — boundary ${
                boundary?.tag ?? "(none: first major line)"
            }, ${minors.length} minor line(s) in window`);
            for (const r of rows) {
                const state = r.unrecorded
                    ? "UNRECORDED"
                    : r.missingGuards.length > 0
                        ? `UNVERIFIED (missing guards: ${r.missingGuards.join(", ")})`
                        : "verified";
                console.log(`  ${r.minor.padEnd(8)} ${state} (${r.behaviors.length} behavior(s))`);
            }
            console.log(`guard suite: ${suiteRc === null ? "no guards registered" : suiteRc === 0 ? "PASS" : `FAIL (rc ${suiteRc})`}`);
            if (suiteRc !== 0) console.log(suiteOut.split("\n").slice(-12).join("\n"));
        }
        if (failed) process.exit(1);
    },
});
