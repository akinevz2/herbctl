// src/commands/float.ts — the float-family collapsed into one verb
// with a mode argument (was: float-yank / float-focus / float-unfocus
// / center / fit / corner / resize as seven bare verbs):
//
//   herbctl float <yank|focus|unfocus|center|fit|corner|resize>
//
//   yank      the yank/defer/slurp float session ($Mod-x)
//   focus     the float-session focus manager ($Mod-f)
//   unfocus   leave the float layer / create it ($ModCtrl-z half)
//   center    center the floating window (--wid, layer modifiers,
//             target root|frame as positional)
//   fit       fit the float to bounds (--target monitor|frame)
//   corner    pin the float to the top-left quadrant (positional
//             root|frame)
//   resize    resize the float (--dx/--dy/--mode/--wid, layer
//             modifiers)
//
// The machines live in lib/{extracted,float-focus,float-unfocus,
// center,fit,corner,verb-resize}.ts — float is only the dispatch
// surface.
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";

import { floatYank } from "../lib/extracted.js";
import { floatFocus } from "../lib/float-focus.js";
import { floatUnfocus } from "../lib/float-unfocus.js";
// The geometry verbs keep their bunli command modules as internal
// machines — the options schemas stay with them; float forwards the
// full flags object and dispatches by mode.
import centerVerb from "../lib/center.js";
import fitVerb from "../lib/fit.js";
import cornerVerb from "../lib/corner.js";
import resizeVerb from "../lib/verb-resize.js";

type VerbHandler = {
    handler: (ctx: { flags: Record<string, unknown>; positional: string[] }) => Promise<void>;
};

const GEOMETRY: Record<string, VerbHandler> = {
    center: centerVerb as unknown as VerbHandler,
    fit: fitVerb as unknown as VerbHandler,
    corner: cornerVerb as unknown as VerbHandler,
    resize: resizeVerb as unknown as VerbHandler,
};

const MACHINES: Record<string, () => Promise<void>> = {
    yank: floatYank,
    focus: floatFocus,
    unfocus: floatUnfocus,
};

const USAGE =
    "Usage: herbctl float <yank|focus|unfocus|center|fit|corner|resize>";

export default defineCommand({
    name: "float" as never,
    description: "float <yank|focus|unfocus|center|fit|corner|resize>",
    options: {
        wid: option(z.string().optional(), {
            description: "Target THIS window (center/fit/corner/resize)", short: "w",
        }),
        target: option(z.enum(["monitor", "frame"]).default("monitor"), {
            description: "fit: rectangle to fit within", short: "t",
        }),
        dx: option(z.coerce.number().default(0), {
            description: "resize: width delta (pixels)", short: "x",
        }),
        dy: option(z.coerce.number().default(0), {
            description: "resize: height delta (pixels)", short: "y",
        }),
        mode: option(z.string().optional(), {
            description:
                "resize: 'frame' to fill the parent frame, or an explicit WxH+X+Y rect",
        }),
    },
    handler: async ({ flags, positional }) => {
        const [mode = "", ...rest] = positional;
        const machine = MACHINES[mode];
        if (machine) {
            await machine();
            return;
        }
        const verb = GEOMETRY[mode];
        if (verb) {
            await verb.handler({ flags, positional: rest });
            return;
        }
        throw new Error(
            USAGE + (mode ? ` — unknown mode '${mode}'` : ""),
        );
    },
});
