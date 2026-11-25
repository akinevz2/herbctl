// src/commands/float-yank.ts — float-yank: the $Mod-x register machine
// (the float step-aside / yanker), all branches:
//
//   SINGLE-WINDOW GUARD: a tag with exactly ONE window -> use_previous
//   ONLY (no float machinery on a lone window).
//
//   floating_focused TRUE (a float holds the layer focus):
//     STEP ASIDE — resize the focused float to a QUARTER of the tag
//     area (half width x half height), center it ON THE SCREEN, then
//     hand focus to the TILING layer (floating_focused off) WITHOUT
//     un-floating the window. Mod-f's float-focused press is the
//     un-float register; Mod-x only shrinks and steps back.
//
//   floating_focused FALSE (tiling layer owns focus):
//     1. The focused client may ALREADY be a float (the post-hand-back
//        edge: the layer register reads false while the float window
//        still holds focus) -> the SAME step-aside as above.
//     2. TRY focusing a float (floating_focused on; it fails when no
//        non-minimized float exists).
//     3. Success -> the float layer is focused, and the FIRST
//        available float is UN-FLOATED onto the tiling layer (the
//        settle re-read; hlwm applies the layer switch
//        asynchronously and a too-early client_count read races it).
//     4. Failure -> no floats exist, populated focused frame -> YANK:
//        the focused client floats, centered in the tag root,
//        RESIZED TO THE PARENT FRAME (fit — NOT the pseudo-fullscreen
//        root fill; that register is Mod-f's). The vacated frame is
//        deliberately LEFT ALONE (the frame is only ever closed in
//        the tidying branch).
//     5. Failure, empty focused frame, a visible float the switch
//        failed to focus -> GRAB it onto the tiling layer anyway.
//     6. Failure, empty focused frame, no floats -> tidying (frame
//        removal, reveal minimized, the herbctl hidden picker in max layout,
//        or use_previous).
//
// Un-float chains intentionally contain NO floating_focused off — hlwm
// tracks the register on un-float (the defensive write raced with it);
// the layer hand-back write runs BEFORE the empty-frame check here.
// Standalone register writes (re-entry failure) remain.

import { attrRaw, hc, listClientsByTag, setAttr } from "./hc.js";
import { hiddenMenu } from "./hidden.js";
import { ui } from "./debug.js";
import { fitTo, placeCenteredIn } from "./geometry.js";
import { unfloatWid, firstVisibleFloat } from "./imperatives.js";

const GEO_RE = /^\d+x\d+\+\d+\+\d+$/;

/**
 * stepAside — the Mod-x float branch: resize the focused float to a
 * QUARTER of the tag area (half width x half height), center it ON
 * THE SCREEN, then hand focus to the tiling layer (floating_focused
 * off) WITHOUT un-floating — the window keeps floating, smaller and
 * out of the way. Mod-f's float-focused press is the un-float
 * register.
 */
async function stepAside(wid?: string): Promise<void> {
    if (!wid) return;
    const geo = (await attrRaw("tags.focus.tiling.root.content_geometry")) || "";
    const m = geo.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/);
    if (m) {
        const [, gw, gh, gx, gy] = m.map(Number) as [unknown, number, number, number, number];
        const w = Math.floor(gw / 2);
        const h = Math.floor(gh / 2);
        const x = gx + Math.floor((gw - w) / 2);
        const y = gy + Math.floor((gh - h) / 2);
        await setAttr(`clients.${wid}.floating_geometry`, `${w}x${h}+${x}+${y}`);
    }
    await hc("attr", "tags.focus.floating_focused", "off");
}

export async function floatYank(): Promise<void> {
    await hc("lock");
    try {
        const orig = await attrRaw("clients.focus.winid");

        // One batched state read (hc_floatx's chain+echo round trip):
        // curframe_wcount | focused_frame.client_count | frame_count |
        // focused_frame.algorithm | tag name | focused content_geometry.
        // Newlines stripped, pipe-split — the same parsing the script
        // does. NOTE: NO clients.focus read in the chain — with the
        // floating layer unfocused and an EMPTY frame hlwm drops
        // clients.focus entirely, and one failed member kills the WHOLE
        // chain (the tag would read empty and firstVisibleFloat would
        // enumerate nothing — the grabbed-nothing bug).
        const state = await hc(
            "chain",
            ",", "attr", "tags.focus.curframe_wcount", ",", "echo", "|",
            ",", "attr", "tags.focus.tiling.focused_frame.client_count", ",", "echo", "|",
            ",", "attr", "tags.focus.frame_count", ",", "echo", "|",
            ",", "attr", "tags.focus.tiling.focused_frame.algorithm", ",", "echo", "|",
            ",", "attr", "tags.focus.name", ",", "echo", "|",
            ",", "attr", "tags.focus.tiling.focused_frame.content_geometry",
        );
        const st = (state?.stdout ?? "").replace(/\n/g, "").split("|");
        const frameClients = st[0] || "0";
        const frameCc = st[1] || "0";
        const frameCount = st[2] || "1";
        const algo = st[3] ?? "";
        const tag = (await attrRaw("tags.focus.name")) || st[4] || "";

        const tagTotal = async (): Promise<string> => {
            if (!tag) return "0";
            return (await attrRaw(`tags.by-name.${tag}.client_count`)) || "0";
        };

        // SINGLE-WINDOW GUARD: with only one window on the tag there
        // is nothing to float, focus or grab — use_previous ONLY.
        if ((await tagTotal()) === "1") {
            await hc("use_previous");
            return;
        }

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
        ui("floatYank: ff=%s firstFloat=%s orig=%s frameCc=%s frameCount=%s", ff, firstFloat, orig, frameCc, frameCount);

        if (ff === "true") {
            ui("floatYank: ff=true -> step aside (orig=%s)", orig);
            await stepAside(orig);
            return;
        }

        // floating_focused FALSE: the focused client may ALREADY be a
        // float (the post-hand-back edge: the layer register reads
        // false while the float window still holds focus) — the SAME
        // step-aside applies.
        const focusProbe = await attrRaw("clients.focus.floating");
        ui("floatYank: focus probe=%j", focusProbe);
        if (focusProbe === "true") {
            ui("floatYank: focused client is a float -> step aside");
            await stepAside(orig);
            return;
        }
        const switched = await hc("attr", "tags.focus.floating_focused", "on");
        ui("floatYank: switch=%j", switched);
        if (switched !== null) {
            // Success: the float layer is focused, and the FIRST
            // available float is UN-FLOATED onto the tiling layer
            // (the pre-scanned first_float is PRIMARY —
            // clients.focus settles late after the switch; hlwm
            // applies the layer switch asynchronously and a too-early
            // client_count read races it — the settle re-read).
            let fcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "0";
            if (fcc === "0") {
                await new Promise((r) => setTimeout(r, 80));
            }
            const wfocus = firstFloat || (await attrRaw("clients.focus.winid"));
            if (wfocus) {
                await unfloatWid(wfocus);
                return;
            }
            await hc("attr", "tags.focus.floating_focused", "off");
            return;
        }

        // Re-entry failed: no non-minimized float exists — BUT a
        // visible float may still be there (hlwm can refuse the layer
        // switch transiently with no focused client): an EMPTY focused
        // frame GRABS the float onto the tiling layer regardless of
        // the switch outcome.
        if (Number(frameCc) > 0) {
            // YANK: float the focused client, centered in the tag
            // root, RESIZED TO THE PARENT FRAME (fit — the
            // pseudo-fullscreen root fill is Mod-f's register), INTO
            // the float session — the newly floated window TAKES the
            // session foreground (the register chain + the machine's
            // own register write). ModCtrl-z's corner / companion
            // machines are the ADDITIVE adds (no foreground claim);
            // Mod-f's lift and this yank are the EXCLUSIVE FOREGROUND
            // adds. The (now possibly empty) frame is deliberately
            // LEFT ALONE — empty frames are only closed in the
            // tidying branch. ONE lock (the native machines take none
            // of their own). The yank target is the FOCUSED window
            // (orig may lag).
            await hc("lock");
            try {
                const yankWid = orig || (await attrRaw("clients.focus.winid"));
                if (yankWid) {
                    await setAttr(`clients.${yankWid}.floating`, "on");
                    await placeCenteredIn(yankWid, "tags.focus.tiling.root.content_geometry");
                    await fitTo(yankWid, "frame");
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
        if (firstFloat) {
            // empty focused frame + a visible float the switch failed
            // to focus: GRAB it onto the tiling layer anyway.
            ui("floatYank: switch failed, empty frame -> grab %s", firstFloat);
            await unfloatWid(firstFloat);
            return;
        }

        // Empty focused frame, no floats at all: tidy the tiling layer
        // instead.
        await tidyNoFloats(orig);
    } finally {
        await hc("unlock");
    }
}

/**
 * tidyNoFloats — the no-floats-to-focus tail, shared by float-yank
 * and float-focus: with nothing floating to focus, tidy the tiling
 * layer instead —
 *   empty focused frame, >1 frame, tag still holds clients -> remove;
 *   hidden (minimized) clients + empty focused frame     -> reveal;
 *   max layout + minimized clients + empty frame        -> polyframes
 *                                                          hidden;
 *   otherwise                                           -> use_previous
 *                                                          (+ bring
 *                                                          the origin).
 * Reads its own state (the caller hands only the pre-read origin wid).
 */
export async function tidyNoFloats(orig?: string): Promise<void> {
    const tag = (await attrRaw("tags.focus.name")) || "";
    const stateOut = (await hc(
        "chain",
        ",", "attr", "tags.focus.curframe_wcount", ",", "echo", "|",
        ",", "attr", "tags.focus.tiling.focused_frame.client_count", ",", "echo", "|",
        ",", "attr", "tags.focus.frame_count", ",", "echo", "|",
        ",", "attr", "tags.focus.tiling.focused_frame.algorithm", ",", "echo", "|",
        ",", "attr", "tags.focus.name",
    ))?.stdout ?? "";
    const parts = stateOut.replace(/\n/g, "").split("|");
    const frameClients = parts[0] || "0";
    const frameCc = parts[1] || "0";
    const frameCount = parts[2] || "1";
    const algo = parts[3] || "";

    const tagTotal = async (): Promise<string> =>
        tag ? ((await attrRaw(`tags.by-name.${tag}.client_count`)) || "0") : "0";

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
        await hiddenMenu(); // the picker migrated from polyframes hidden
        return;
    }

    await hc("use_previous");
    if (orig) await hc("bring", orig);
}
