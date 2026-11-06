// src/commands/rotate-tree.ts — bunli verb for the rotateTree chain
// (see src/lib/chains.ts for the port and the source binding). The
// only nav verb with flags: --focus forces the focus/skip branch,
// --smart[=N] reverses the rotate condition (rotate N or more frames,
// cycle backwards below — the $ModCtrl-c complement; bare --smart
// means N=3, which the parser delivers as the literal "true" — the
// preprocess folds it to the default threshold).
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { rotateTree, type RotateTreeMode } from "../lib/chains.js";

export default defineCommand({
    name: "rotate-tree" as never,
    description: "Rotate the tree",
    options: {
        focus: option(z.boolean().default(false), {
            description: "Force the focus/cycle branch (never rotate)",
        }),
        smart: option(
            z.preprocess(
                (v) => (v === "true" ? 3 : v),
                z.coerce.number().optional(),
            ),
            {
                description:
                    "Rotate frame_count >= N frames, cycle backwards below (default 3)",
                argumentKind: "flag",
            },
        ),
    },
    handler: async ({ flags }) => {
        const mode: RotateTreeMode =
            flags.smart !== undefined ? "smart" : flags.focus ? "focus" : "auto";
        const ok = await rotateTree(mode, flags.smart ?? 3);
        if (ok === false) process.exit(1);
    },
});
