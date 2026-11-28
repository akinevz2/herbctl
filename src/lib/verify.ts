// src/lib/verify.ts — the release-gate PURE core (the `verify` verb's
// testable half). Doctrine: before a MAJOR release, every MINOR
// revision rolled since the previous major must be VERIFIED against
// examples of hereupon observed behaviour — the behavior registry
// (tests/rigor/behaviors.json) records, per minor line, the observed
// examples and the rigor guard pinning each; verification = every
// covered minor's behaviors carry EXISTING guards and the guard set
// passes (the verb half runs the suite; this half owns the arithmetic).

/** A recorded observed behaviour: the minor line it belongs to, the
 *  concrete example (what was observed, verbatim enough to recognize
 *  a regression), and the rigor guard test pinning it. */
export interface BehaviorEntry {
    /** stable behavior id (the guard test references it) */
    id: string;
    /** the tag the behavior was observed/landed at (v<maj>.<min>.<pat>) */
    since: string;
    /** the observed-behaviour example, human-readable */
    example: string;
    /** the rigor guard file pinning it (checkout-relative) */
    guard: string;
}

export interface MinorVerification {
    /** the minor LINE, e.g. "v1.5" */
    minor: string;
    /** behaviors recorded against this minor line */
    behaviors: BehaviorEntry[];
    /** behaviors whose guard file is MISSING from the checkout */
    missingGuards: string[];
    /** true when the minor has no recorded behaviors at all */
    unrecorded: boolean;
}

/** Parse `v<maj>.<min>.<pat>` (prefix tolerance: with/without v). */
export function parseTag(
    tag: string,
): { major: number; minor: number; patch: number } | null {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
    if (!m) return null;
    return { major: +m[1], minor: +m[2], patch: +m[3] };
}

const tagKey = (t: { major: number; minor: number; patch: number }) =>
    t.major * 10000 + t.minor * 100 + t.patch;

/** The previous MAJOR release boundary: the HIGHEST tag whose major
 *  is strictly below the current major (its last patch/minor). Null
 *  when there is none (the first major line — everything verifies). */
export function previousMajorBoundary(
    tags: string[],
    current: { major: number; minor: number; patch: number },
): { tag: string; major: number; minor: number; patch: number } | null {
    let best: { tag: string; v: { major: number; minor: number; patch: number } } | null = null;
    for (const tag of tags) {
        const v = parseTag(tag);
        if (!v || v.major >= current.major) continue;
        if (!best || tagKey(v) > tagKey(best.v)) best = { tag, v };
    }
    return best === null
        ? null
        : { tag: best.tag, major: best.v.major, minor: best.v.minor, patch: best.v.patch };
}

/** The distinct MINOR lines rolled since the previous major boundary
 *  (up to and including the current version's minor). Each returned
 *  entry carries its boundary tag (the first release seen on the
 *  line) for reporting. */
export function minorsSince(
    tags: string[],
    current: { major: number; minor: number; patch: number },
    boundary: { major: number; minor: number; patch: number } | null,
): Array<{ line: string; firstTag: string }> {
    const cur = tagKey(current);
    const floor = boundary ? tagKey(boundary) : -1;
    const byLine = new Map<number, { line: string; firstTag: string; key: number }>();
    for (const tag of tags) {
        const v = parseTag(tag);
        if (!v) continue;
        const k = tagKey(v);
        // inside the window: strictly after the previous major's last
        // release, not beyond the current version (work-in-progress
        // tags ahead of package.json are not release-gated)
        if (k <= floor || k > cur) continue;
        const lineKey = v.major * 100 + v.minor;
        const entry = byLine.get(lineKey);
        if (!entry) {
            byLine.set(lineKey, {
                line: `v${v.major}.${v.minor}`,
                firstTag: `v${v.major}.${v.minor}.${v.patch}`,
                key: k,
            });
        } else if (k < entry.key) {
            entry.firstTag = `v${v.major}.${v.minor}.${v.patch}`;
            entry.key = k;
        }
    }
    const lines = [...byLine.values()]
        .sort((a, b) => a.key - b.key)
        .map(({ line, firstTag }) => ({ line, firstTag }));
    // the CURRENT minor line is ALWAYS in the window — even when
    // untagged (release tags lag package.json; the pre-major gate
    // exists precisely to verify the in-flight minor at HEAD)
    if (!lines.some((m) => m.line === `v${current.major}.${current.minor}`)) {
        lines.push({
            line: `v${current.major}.${current.minor}`,
            firstTag: `v${current.major}.${current.minor}.${current.patch} (unreleased)`,
        });
    }
    return lines;
}

/** Match a behavior's `since` tag to a minor LINE ("v1.5"). */
export function sinceLine(since: string): string | null {
    const v = parseTag(since);
    return v === null ? null : `v${v.major}.${v.minor}`;
}

/** The full pure verification: per-minor coverage over the registry.
 *  Guards are NOT run here (the verb owns the suite); this checks
 *  existence and grouping. */
export function verifyMinors(
    minors: Array<{ line: string; firstTag: string }>,
    behaviors: BehaviorEntry[],
    guardExists: (path: string) => boolean,
): MinorVerification[] {
    return minors.map((m) => {
        const own = behaviors.filter((b) => sinceLine(b.since) === m.line);
        const missingGuards = own
            .filter((b) => !guardExists(b.guard))
            .map((b) => b.guard);
        return {
            minor: m.line,
            behaviors: own,
            missingGuards,
            unrecorded: own.length === 0,
        };
    });
}

/** The overall gate decision: UNVERIFIED exists when a guard is
 *  missing (a recorded behavior lost its pin) — --strict additionally
 *  fails unrecorded minors. */
export function gateFails(
    rows: MinorVerification[],
    strict: boolean,
): boolean {
    return rows.some((r) => r.missingGuards.length > 0 || (strict && r.unrecorded));
}
