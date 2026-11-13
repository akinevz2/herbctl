// src/commands/minimize.ts — minimize (hide) a window (the migrated
// hc_minimize: clients.<wid>.minimized = true, the same effect as
// hlwm's native minimize command). Targeting:
//   no target    the focused window; if NO client is focused (empty
//                frame) the empty focused frame is removed instead
//                (close_or_remove — the mod-q idiom)
//   --frame-selected (-c)  the selected client of the current tiling
//                          frame
//   --float (-f)           the focused floating window (floating layer
//                          focused)
//   --wid 0x… (-w)         an explicit winid wins over the flags
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { attr, hc } from "../lib/hc.js";

export default defineCommand({
    name: "minimize" as never,
    description: "Minimize (hide) a window",
    options: {
        wid: option(z.string().optional(), {
            description: "Minimize THIS window (wins over the other targets)",
            short: "w",
        }),
        "frame-selected": option(z.boolean().default(false), {
            description: "Target the selected client of the current tiling frame",
            short: "c",
            argumentKind: "flag",
        }),
        float: option(z.boolean().default(false), {
            description: "Target the focused floating window",
            short: "f",
            argumentKind: "flag",
        }),
    },
    handler: async ({ flags }) => {
        if (flags["frame-selected"] && flags.float) {
            throw new Error("minimize: --frame-selected and --float are mutually exclusive");
        }

        let wid = flags.wid ?? "";
        if (wid === "" && flags["frame-selected"]) {
            const cc = Number((await attr("tags.focus.tiling.focused_frame.client_count")) ?? "0");
            wid = "";
            if (cc >= 1) {
                const sel = (await attr("tags.focus.tiling.focused_frame.selection")) ?? "";
                wid = (await attr(`tags.focus.tiling.focused_frame.client_${sel}.winid`)) ?? "";
            }
            if (wid === "") {
                throw new Error("minimize: no client in the current tiling frame");
            }
        } else if (wid === "" && flags.float) {
            const ff = (await attr("tags.focus.floating_focused")) ?? "false";
            wid = (await attr("clients.focus.winid")) ?? "";
            if (ff !== "true" || wid === "") {
                throw new Error("minimize: no focused floating window");
            }
        } else if (wid === "") {
            wid = (await attr("clients.focus.winid")) ?? "";
        }

        if (wid === "") {
            // Nothing focused: the focused frame is an empty frame —
            // remove it instead (close_or_remove on an empty frame =
            // frame removal, the same idiom the mod-q chain uses).
            await hc("close_or_remove");
            return;
        }

        await hc("set_attr", `clients.${wid}.minimized`, "true");
    },
});
