// src/commands/resize.ts — the migrated hc_resize (legacy argv parity:
// what hc_zoom / the shim feed it).
//
//   hc_resize [-10 | 40] ... — bunli cannot safely take dash-prefixed
//        positionals, so the shim translates:
//        hc_resize <dx> [dy]      -> --dx=… [--dy=…]
//        hc_resize <wid> frame    -> --wid=… --mode=frame
//        hc_resize <wid> <WxH+X+Y>-> --wid=… --mode=<WxH+X+Y>
//   This command therefore reads ONLY the --wid/--dx/--dy/--mode options.
// Layer modifiers compose around the resize (--to-float for the
// float-then-fill idiom, --foreground to bring the session forward).
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { attr } from "../lib/hc.js";
import { resizeDelta, resizeFill, resizeToRect } from "../lib/resize.js";
import { layerMods, layerOptions, withLayerMods } from "../lib/layers.js";

export default defineCommand({
    name: "resize" as never,
    description: "Resize floating client",
    options: {
        wid: option(z.string().optional(), {
            description: "Target THIS window instead of the focused one", short: "w",
        }),
        dx: option(z.coerce.number().default(0), {
            description: "Width delta (pixels)", short: "x",
        }),
        dy: option(z.coerce.number().default(0), {
            description: "Height delta (pixels)", short: "y",
        }),
        mode: option(z.string().optional(), {
            description: "'frame' to fill the client's parent frame, or an explicit WxH+X+Y content rect",
        }),
        ...layerOptions,
    },
    handler: async ({ flags }) => {
        const wid = flags.wid || (await attr("clients.focus.winid"));
        if (!wid) {
            throw new Error("hc_resize: no focused client");
        }
        const mode = flags.mode ?? "";
        await withLayerMods(wid, layerMods(flags), async (w) => {
            if (mode === "frame") {
                await resizeFill(w, "frame");
                return;
            }
            if (mode === "root") {
                await resizeFill(w, "root");
                return;
            }
            if (/^[0-9]+x[0-9]+[+-][0-9]+[+-][0-9]+$/.test(mode)) {
                await resizeToRect(w, mode);
                return;
            }
            if (mode !== "") {
                throw new Error(`hc_resize: unknown mode '${mode}'`);
            }
            await resizeDelta(w, flags.dx, flags.dy);
        });
    },
});
