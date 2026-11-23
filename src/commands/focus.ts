// src/commands/focus.ts — the focus verb over the allocation surface
// (the counterpart of new/add/close):
//
//   herbctl focus <frame|tagspace [name]|terminal>
//
//   frame               cycle focus across the frames of the tag
//   tagspace [name]     enter the hlwm tag (default: the smallest free
//                       numeric name — focusing an unallocated
//                       tagspace allocates it)
//   terminal            focus the most recently attached terminal client
import { defineCommand } from "@bunli/core";
import { spawnSync } from "node:child_process";

import { allocateTagspace, focusTerminal } from "../lib/allocate.js";
import { hc } from "../lib/hc.js";

const MACHINES: Record<string, (name?: string) => Promise<unknown>> = {
    frame: () => hc("cycle_frame", "+1"),
    tagspace: async (name?: string) => {
        if (name !== undefined) {
            // an existing tagspace is entered; an unknown name is
            // allocated first (focus implies allocation here)
            return allocateTagspace(true, name);
        }
        return allocateTagspace(true);
    },
    terminal: focusTerminal,
} as const;

/** the optional second positional (focus tagspace <name>) rides the
 *  raw argv — bunli gives each verb its own positional slot */
function tagArg(): string | undefined {
    const a = process.argv.slice(2);
    const i = a.indexOf("tagspace");
    const n = a[i + 1];
    return n && !n.startsWith("-") ? n : undefined;
}

export default defineCommand({
    name: "focus" as never,
    description: "focus <frame|tagspace [name]|terminal>",
    handler: async ({ positional }) => {
        const mode = positional[0] as keyof typeof MACHINES | undefined;
        if (!mode || !(mode in MACHINES)) {
            console.error(
                `Usage: herbctl focus <frame|tagspace [name]|terminal>`
                + (mode ? ` — unknown mode '${mode}'` : ""),
            );
            process.exit(2);
        }
        const ok = await MACHINES[mode](tagArg());
        if (ok === false) process.exit(1);
    },
});
