// src/commands/close-tiling.ts — close ONLY on the tiling layer (the
// $ModShift-q binding): a focused float is untouched; a tiling window
// is closed, and the frame is never removed (plain `close`, not
// close_and_remove / close_or_remove).
import { defineCommand } from "@bunli/core";

import { attr, hc } from "../lib/hc.js";

export default defineCommand({
    name: "close-tiling" as never,
    description: "Close on tiling layer",
    handler: async () => {
        const ff = (await attr("tags.focus.floating_focused")) ?? "false";
        if (ff === "true") return; // a float has focus: untouched
        const wid = (await attr("clients.focus.winid")) ?? "";
        if (wid === "") return; // nothing focused: fail soft
        await hc("close");
    },
});
