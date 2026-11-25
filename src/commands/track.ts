// src/commands/track.ts — `herbctl track` — the blocking reporter:
//
//   herbctl track [--quiet]
//
// Captures the CALLING TERMINAL's window (the focused client at
// spawn — the turn boundary, where focus is authoritative) and
// tails the hlwm event stream, reporting every state change to
// stdout as JSON lines:
//   {"state":"healthy|drop|death|separation","wid":"0x…","ts":…}
//
// NOTIFICATION OWNERSHIP: bare mode — the internal notifier spawns/
// hides the transient notification (per-state action: drop → jumpto;
// separation → interrupt + bring). --quiet — REPORT ONLY: the
// consumer (the opencode plugin, over the stdout pipe — memory, not
// the filesystem) owns the notification surface.
//
// Blocking: ends on the tracked window's death, on stdin EOF (the
// plugin's end-of-turn cancel), or on SIGINT. The NOTIFICATION
// SPAWNING is never a subcommand — it is internal to the verb's
// modes; the notification OWNER as a user-surfaceable daemon is
// `herbctl sentry`.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { track } from "../lib/track.js";

export default defineCommand({
    name: "track" as never,
    description:
        "track the calling terminal's window: stream state events (healthy|drop|death|separation); owns notifications unless --quiet",
    options: {
        quiet: option(z.boolean().default(false), {
            description:
                "report ONLY — the consumer (the opencode plugin) owns the notification surface",
            short: "q",
            argumentKind: "flag",
        }),
        sentry: option(z.string().optional(), {
            description:
                "the REOPEN WRAPPER mode: watch this wid (spawned by the plugin, composed over a tracker's stream); owns the notification surface — drop/separation open it, death → the persistent reopen, healthy → close",
        }),
    },
    handler: async ({ flags }) => {
        await track({ quiet: flags.quiet, sentry: flags.sentry });
    },
});
