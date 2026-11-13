// src/commands/float-yank.ts — float-yank: the hc_floatx
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
//     UN-FLOAT the focused float — the register chain re-tiles it
//     into the focused frame below whatever it holds (populated or
//     empty frame, one frame or many: every former sub-case unified)
//     — then ATTEMPT to re-focus the tiling layer: floating_focused
//     off as a SEPARATE follow-up write (hlwm tracks the register on
//     un-float; a defensive write INSIDE the chain raced it — the
//     follow-up is an idempotent no-op when it already handed focus
//     back).
//
// Un-float chains intentionally contain NO floating_focused off — hlwm
// tracks the register on un-float (the defensive write raced with it);
// the re-focus attempt runs AFTER the chain as a separate write.
// Standalone register writes (re-entry failure) remain.

import { attrRaw, hc, helperDir, listClientsByTag, setAttr } from "./hc.js";
import { placeCenteredIn } from "./geometry.js";
import { unfloatWid, firstVisibleFloat } from "./imperatives.js";

export async function floatYank(): Promise<void> {
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
        const firstFloat = await firstVisibleFloat(tag);

        if (ff === "true") {
            // UN-FLOAT the focused float — the register chain re-tiles
            // it into the focused frame below whatever it holds —
            // then ATTEMPT to re-focus the tiling layer (see the
            // header: the floating_focused off write is a separate
            // follow-up, not part of the chain).
            if (orig) {
                await unfloatWid(orig);
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
            // ONE lock (the native machines take none of their own).
            // The yank target is the FOCUSED window (orig may lag).
            await hc("lock");
            try {
                const yankWid = orig || (await attrRaw("clients.focus.winid"));
                if (yankWid) {
                    await setAttr(`clients.${yankWid}.floating`, "on");
                    await placeCenteredIn(yankWid, "tags.focus.tiling.root.content_geometry");
                    // Foreground the float session (the historical hc_center
                    // closing tail), then the machine's own register
                    // write — inside the lock, as the script wrote it
                    // (idempotent on the chain's try-write).
                    await hc(
                        "chain", ".",
                        "try", "set_attr", "tags.focus.floating_focused", "on", ".",
                        "jumpto", yankWid, ".",
                        "bring", yankWid,
                    );
                    await hc("attr", "tags.focus.floating_focused", "on");
                }
            } finally {
                await hc("unlock");
            }
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
