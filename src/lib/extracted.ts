// src/commands/extracted.ts — get-extracted: the hc_floatx
// layer-focus toggle / yanker
// (~/dots/herbst_focus/.local/bin/hc_floatx, bound as $Mod-x in dots),
// all branches, faithfully:
//
//   floating_focused FALSE (tiling layer owns focus):
//     1. TRY focusing a float (floating_focused on; it fails when no
//        non-minimized float exists).
//     2. Success -> UN-FLOAT the float it focused (the pre-scanned
//        first_float is PRIMARY — clients.focus settles late after the
//        switch).
//     3. Failure -> no floats exist:
//          populated focused frame  -> YANK: the focused client floats
//                                     at its current size, centered in
//                                     the monitor, INTO the float
//                                     session. The vacated frame is
//                                     deliberately LEFT ALONE (the
//                                     frame is only ever closed in
//                                     the tidying branch).
//          empty focused frame      -> tidying (frame removal, reveal
//                                     minimized, polyframes hidden in
//                                     max layout, or use_previous).
//
//   floating_focused TRUE (a float holds the layer focus):
//     populated focused frame, ONE frame on the tag -> use_previous,
//                                 hc_tile, un-float the focused client
//                                 there.
//     populated focused frame, MULTIPLE frames -> DEFER: hand focus to
//                                 the tiling layer; the next press
//                                 re-runs the focus-and-un-float branch.
//     empty focused frame      -> UN-FLOAT the focused float into the
//                                 empty frame.
//
// Un-float chains intentionally contain NO floating_focused off — hlwm
// tracks the register on un-float (the defensive write raced with it).
// Standalone register writes (defer, re-entry failure) remain.

import { attrRaw, hc, helper, helperDir, listClientsByTag } from "./hc.js";
import { unfloatWid } from "./imperatives.js";

export async function getExtracted(): Promise<void> {
    await hc("lock");
    try {
        const orig = await attrRaw("clients.focus.winid");

        // One batched state read (hc_floatx's chain+echo round trip):
        // curframe_wcount | focused_frame.client_count | frame_count |
        // focused_frame.algorithm | tag name | focused content_geometry
        // | floating_effectively. Newlines stripped, pipe-split — the
        // same parsing the script does.
        const state = await hc(
            "chain",
            ",", "attr", "tags.focus.curframe_wcount", ",", "echo", "|",
            ",", "attr", "tags.focus.tiling.focused_frame.client_count", ",", "echo", "|",
            ",", "attr", "tags.focus.frame_count", ",", "echo", "|",
            ",", "attr", "tags.focus.tiling.focused_frame.algorithm", ",", "echo", "|",
            ",", "attr", "tags.focus.name", ",", "echo", "|",
            ",", "attr", "tags.focus.tiling.focused_frame.content_geometry", ",", "echo", "|",
            ",", "attr", "clients.focus.floating_effectively",
        );
        const st = (state?.stdout ?? "").replace(/\n/g, "").split("|");
        const frameClients = st[0] || "0";
        const frameCc = st[1] || "0";
        const frameCount = st[2] || "1";
        const algo = st[3] ?? "";
        const tag = st[4] ?? "";

        const tagTotal = async (): Promise<string> => {
            if (!tag) return "0";
            return (await attrRaw(`tags.by-name.${tag}.client_count`)) || "0";
        };

        const hasMinimizedClients = async (): Promise<boolean> => {
            if (!tag) return false;
            const wids = await listClientsByTag(tag);
            if (wids.length === 0) return false;
            const r = await hc(
                "chain",
                ...wids.flatMap((w) => [",", "attr", `clients.${w}.minimized`]),
            );
            return r?.stdout.includes("true") ?? false;
        };

        // Scan for the first visible (non-minimized) float on the tag,
        // resolved UP FRONT (clients.focus settles late after the
        // switch).
        const ff = (await attrRaw("tags.focus.floating_focused")) || "false";
        let firstFloat = "";
        for (const c of await listClientsByTag(tag)) {
            const floating = (await attrRaw(`clients.${c}.floating`)) || "false";
            if (floating === "true") {
                const minimized = (await attrRaw(`clients.${c}.minimized`)) || "false";
                if (minimized === "false") {
                    firstFloat = c;
                    break;
                }
            }
        }

        // Mod-f's tile register, performed HERE (Mod-x owns hc_tile in
        // this branch): populated frame in a NON-MAX layout ->
        // un-float directly; populated frame in max layout -> hc_tile
        // makes the new empty frame and the window un-floats into it.
        const unfloatIntoFrameBelow = async (wid: string): Promise<void> => {
            const fcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "0";
            const falgo = await attrRaw("tags.focus.tiling.focused_frame.algorithm");
            if (fcc !== "0" && falgo === "max") {
                await helper("hc_tile", [wid]);
                return;
            }
            await unfloatWid(wid);
        };

        if (ff === "true") {
            if (frameCc !== "0") {
                if (frameCount === "1") {
                    // The revised sequence: use_previous (back to the
                    // previously viewed tag), hc_tile (the tile register
                    // on whatever holds focus there), then un-float the
                    // newly focused client if it is floating.
                    await hc("use_previous");
                    await helper("hc_tile");
                    const wfocus = await attrRaw("clients.focus.winid");
                    if (wfocus) {
                        await hc("attr", `clients.${wfocus}.floating`, "false");
                    }
                } else {
                    // DEFER: hand focus to the tiling layer; the next
                    // press re-runs the focus-and-un-float branch.
                    await hc("attr", "tags.focus.floating_focused", "off");
                }
                return;
            }
            // Empty focused frame: un-float the float into it directly.
            const wfocus = await attrRaw("clients.focus.winid");
            if (wfocus) {
                await unfloatIntoFrameBelow(wfocus);
                return;
            }
            await hc("attr", "tags.focus.floating_focused", "off");
            return;
        }

        // floating_focused FALSE: try focusing a float FIRST.
        if ((await hc("attr", "tags.focus.floating_focused", "on")) !== null) {
            // Success: the switched-to float is un-floated (manual
            // un-float is Mod-x's register). The PRE-SCANNED first_float
            // is PRIMARY — clients.focus settles late after the switch.
            const wfocus = firstFloat || (await attrRaw("clients.focus.winid"));
            if (wfocus) {
                await unfloatWid(wfocus);
                return;
            }
            await hc("attr", "tags.focus.floating_focused", "off");
            return;
        }

        // Re-entry failed: no non-minimized float exists.
        if (Number(frameCc) > 0) {
            // YANK: float the focused client, center it in the monitor's
            // geometry at its current size, INTO the float session. The
            // (now possibly empty) frame is deliberately LEFT ALONE.
            await hc("attr", "clients.focus.floating", "on");
            await helper("hc_center", ["root"]);
            await hc("attr", "tags.focus.floating_focused", "on");
            return;
        }

        // Empty frame, no floats: tidying.
        if (Number(frameCount) > 1) {
            if (frameClients === "0" && (await tagTotal()) !== "0") {
                await hc("remove");
                return;
            }
            // Hidden windows exist and nothing is tiled in the focused
            // frame: reveal them.
            if ((await hasMinimizedClients()) && Number(frameCc) === 0) {
                const wids = await listClientsByTag(tag);
                await hc(
                    "chain",
                    ...wids.flatMap((w) => [",", "attr", `clients.${w}.minimized`, "off"]),
                );
                return;
            }
        }

        if (frameClients === "0" && (await tagTotal()) !== "0") {
            await hc("remove");
            return;
        }

        if (algo === "max" && (await hasMinimizedClients()) && Number(frameClients) < 1) {
            await hc("spawn", `${helperDir()}/polyframes hidden`);
            return;
        }

        await hc("use_previous");
        if (orig) await hc("bring", orig);
    } finally {
        await hc("unlock");
    }
}
