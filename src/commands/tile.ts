// src/commands/tile.ts — closest-empty-frame navigation + tiling (the
// migrated hc_tile / polyframes tile). tile() is its own single-lock
// machine (search/split/focus, the destination window ends up
// focused); the only meaningful modifier here is --foreground, applied
// AFTER the insert to the now-focused window (join the float session:
// floating_focused on + jumpto + bring).
import { defineCommand } from "@bunli/core";

import { attr, hc } from "../lib/hc.js";
import { tile } from "../lib/tile.js";

export default defineCommand({
    name: "tile" as never,
    description: "Tile into empty frame",
    options: {
        foreground: optionForForeground(),
    },
    handler: async ({ flags, positional }) => {
        await tile(positional[0]);
        if (flags.foreground) {
            const wid = (await attr("clients.focus.winid")) ?? "";
            if (wid) {
                await hc(
                    "chain", ".",
                    "try", "set_attr", "tags.focus.floating_focused", "on", ".",
                    "jumpto", wid, ".",
                    "bring", wid,
                );
            }
        }
    },
});

// Local import shim: option comes from @bunli/core (kept next to its
// only use here to avoid spreading the layerOptions schema, whose
// to-float/to-tiling halves have no meaning for tile's insert step).
import { option } from "@bunli/core";
import { z } from "zod";

function optionForForeground() {
    return option(z.boolean().default(false), {
        description: "Foreground the float session after: floating_focused on + jumpto + bring",
        argumentKind: "flag",
    });
}
