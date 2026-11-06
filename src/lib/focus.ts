// src/commands/float-focus.ts — float-focus: the hc_focus float-register
// machine (~/dots/herbst_focus/.local/bin/hc_focus, the $Mod-f key —
// distinct from zoom, which is hc_zoom on $ModCtrl-f):
//
//   Pre-scan the first VISIBLE float on the tag (the only candidate
//   the floating layer can focus; a fallback for the focus read that
//   may lag right after the layer switch).
//
//   floating_focused FALSE:
//     TRY the layer switch (floating_focused on; fails when no
//     non-minimized float exists).
//     Success -> the float it focused STAYS floating when the focused
//     frame holds children (no stacking); an EMPTY frame -> UN-FLOAT
//     the float into it (the register chain: fullscreen/pseudotile/
//     floating off — NO jumpto, the window is already focused; NO
//     floating_focused write — hlwm tracks the register on un-float).
//     Failure -> float the current window, but ONLY when the focused
//     frame's layout algorithm is "max": flags off, hc_center frame
//     (the size-keeping lift), close the vacated frame when it reads
//     zero clients (`remove` — Mod-f owns frame closing on this path),
//     hc_fit_to frame. Afterwards the focused frame is set to the max
//     algorithm regardless (the script's unconditional tail).
//
//   floating_focused TRUE (a float has focus): DIRECT un-float — no
//   hc_tile (that is Mod-x's register; the window re-tiles into the
//   frame below whatever it holds). The frame's client_count is read
//   first and unused — the script does exactly that.
//
//   NO script-level lock: the helpers take their own
//   reference-counted WM locks (hc_focus's header).

import { attrRaw, hc, helper, listClientsByTag } from "./hc.js";

export async function floatFocus(): Promise<void> {
    const tag = await attrRaw("tags.focus.name");

    // Pre-scan the first visible (non-minimized) float on the tag.
    let floatWid = "";
    if (tag) {
        for (const c of await listClientsByTag(tag)) {
            const floating = (await attrRaw(`clients.${c}.floating`)) || "false";
            if (floating === "true") {
                const minimized = (await attrRaw(`clients.${c}.minimized`)) || "false";
                if (minimized === "false") {
                    floatWid = c;
                    break;
                }
            }
        }
    }

    const ff = (await attrRaw("tags.focus.floating_focused")) || "false";

    if (ff !== "true") {
        // a) false; b) try the layer switch.
        if ((await hc("attr", "tags.focus.floating_focused", "on")) !== null) {
            // c) switch succeeded. The PRE-SCANNED float wid is PRIMARY —
            // clients.focus may lag a settle-tick after the switch.
            const fcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "0";
            const wid = floatWid || (await attrRaw("clients.focus.winid"));
            if (fcc === "0") {
                // e) un-float the float into the empty frame (no jumpto —
                // it is already focused; no register write — hlwm tracks
                // it on un-float).
                await hc(
                    "chain",
                    ",", "attr", `clients.${wid}.fullscreen`, "off",
                    ",", "attr", `clients.${wid}.pseudotile`, "off",
                    ",", "attr", `clients.${wid}.floating`, "off",
                );
            }
            // f) otherwise: terminate — the float stays floating, the
            // floating layer holds focus (no stacking).
            return;
        }

        // g) the switch failed (no float to focus): float the current
        // window — but ONLY in the max layout.
        const algo = await attrRaw("tags.focus.tiling.focused_frame.algorithm");
        if (algo === "max") {
            const wid = await attrRaw("clients.focus.winid");
            if (wid) {
                await hc(
                    "chain",
                    ",", "attr", `clients.${wid}.fullscreen`, "off",
                    ",", "attr", `clients.${wid}.pseudotile`, "off",
                );
                await helper("hc_center", ["frame"]);
                // The lifted window vacated its tile — when the focused
                // frame reads zero clients now, close it (Mod-f's
                // register; removes the split).
                const vcc = (await attrRaw("tags.focus.tiling.focused_frame.client_count")) || "1";
                if (vcc === "0") {
                    await hc("remove");
                }
                await helper("hc_fit_to", ["frame"]);
            }
        }
        await hc("attr", "tags.focus.tiling.focused_frame.algorithm", "max");
        return;
    }

    // h) floating_focused TRUE: a floating window has focus. Direct
    // un-float — NO hc_tile (Mod-x's register).
    let wid = await attrRaw("clients.focus.winid");
    if (!wid) wid = floatWid;
    if (!wid) return;
    await attrRaw("tags.focus.tiling.focused_frame.client_count");
    await hc(
        "chain",
        ",", "attr", `clients.${wid}.fullscreen`, "off",
        ",", "attr", `clients.${wid}.pseudotile`, "off",
        ",", "attr", `clients.${wid}.floating`, "off",
    );
}

// float-unfocus — the $Mod-x command (herbctl v1.4.0; hc_floatx, the
// old $Mod-x register, moves to $ModCtrl-x):
//
//   floating_focused TRUE (a float holds focus):
//     focused tiling frame EMPTY (curframe_wcount = 0) -> UN-FLOAT the
//       focused float into it (the register chain: fullscreen/
//       pseudotile/floating off — no jumpto, the window is already
//       focused; hlwm tracks the register on un-float).
//     otherwise -> focus the TILING layer (floating_focused off) —
//       the float stays floating, untouched.
//
//   floating_focused FALSE (the tiling layer owns focus):
//     the focused tiling window — captured first — becomes a small
//       companion float UNCONDITIONALLY. Sizing runs BEFORE the
//       corner move: hc_resize frame stretches the fresh float
//       deco-flush onto its old tile rect (the tiled size), then any
//       dimension larger than half the work area comes DOWN to half
//       (never up — smaller windows keep their adopted size), and the
//       capped rect is re-issued flush in the top-left corner (content
//       rect inset by the theme.floating deco margins — the
//       deterministic margin source; the live decoration read races
//       hlwm's async float-deco apply).
//     a pre-existing float (the pre-scanned wid) -> recall it: focus
//       ONLY, no un-float — floating_focused on, jumpto, then
//       hc_center root.
//     no pre-existing float -> the companion IS the float session's
//       focus: floating_focused on (the yank convention), no jumpto,
//       no centering.
//
// Fail-soft everywhere; no script-level lock (hc_center takes its own
// reference-counted WM lock — the hc_focus header convention).
export async function floatUnfocus(): Promise<void> {
    const tag = await attrRaw("tags.focus.name");

    // Pre-scan the first visible (non-minimized) float on the tag.
    let floatWid = "";
    if (tag) {
        for (const c of await listClientsByTag(tag)) {
            const floating = (await attrRaw(`clients.${c}.floating`)) || "false";
            if (floating === "true") {
                const minimized = (await attrRaw(`clients.${c}.minimized`)) || "false";
                if (minimized === "false") {
                    floatWid = c;
                    break;
                }
            }
        }
    }

    const ff = (await attrRaw("tags.focus.floating_focused")) || "false";

    if (ff === "true") {
        // a float has focus. clients.focus may lag a settle-tick —
        // fall back to the pre-scanned wid (the floatFocus pattern).
        let wid = await attrRaw("clients.focus.winid");
        if (!wid) wid = floatWid;
        const cwc = (await attrRaw("tags.focus.curframe_wcount")) || "1";
        if (cwc === "0" && wid) {
            // un-float the focused float into the empty focused frame.
            await hc(
                "chain",
                ",", "attr", `clients.${wid}.fullscreen`, "off",
                ",", "attr", `clients.${wid}.pseudotile`, "off",
                ",", "attr", `clients.${wid}.floating`, "off",
            );
            return;
        }
        // populated focused frame: hand focus to the tiling layer —
        // the float stays floating, untouched.
        await hc("attr", "tags.focus.floating_focused", "off");
        return;
    }

    // the tiling layer owns focus: the focused tiling window —
    // captured before anything moves focus — becomes a small companion
    // float UNCONDITIONALLY (the old ordering ran it only after a
    // successful recall, which made the key a silent no-op on a tag
    // without floats). Sizing runs BEFORE the corner move: hc_resize
    // frame first stretches the fresh float deco-flush onto its old
    // tile rect (the size the window had while tiled), then any
    // dimension LARGER than half the work area comes DOWN to half
    // (never up — a window already smaller than a quarter of the
    // screen keeps its adopted size), and the capped rect is re-issued
    // flush in the top-left corner. The content rect is inset by the
    // floating deco margins (theme.floating reads, the deterministic
    // margin source: the live decoration read races hlwm's async
    // float-deco apply) so the WINDOW's x/y offsets are zero, borders
    // and title included.
    const tilingWid = await attrRaw("clients.focus.winid");
    if (tilingWid) {
        await hc(
            "chain",
            ",", "attr", `clients.${tilingWid}.fullscreen`, "off",
            ",", "attr", `clients.${tilingWid}.pseudotile`, "off",
            ",", "attr", `clients.${tilingWid}.floating`, "on",
        );
        await helper("hc_resize", [tilingWid, "frame"]);
        const rootGeom = await attrRaw("tags.focus.tiling.root.content_geometry");
        const rm = rootGeom.match(/^(\d+)x(\d+)([+-]\d+)([+-]\d+)$/);
        const geo = await attrRaw(`clients.${tilingWid}.floating_geometry`);
        const gm = geo.match(/^(\d+)x(\d+)/);
        let w = 0;
        let h = 0;
        if (gm) {
            w = Number(gm[1]);
            h = Number(gm[2]);
            if (rm) {
                // cap at the quarter screen — shrink-only, never grow
                w = Math.min(w, Math.floor(Number(rm[1]) / 2));
                h = Math.min(h, Math.floor(Number(rm[2]) / 2));
            }
        } else if (rm) {
            // no adopted size readable — fall back to the quarter rect
            w = Math.floor(Number(rm[1]) / 2);
            h = Math.floor(Number(rm[2]) / 2);
        }
        if (w > 0 && h > 0) {
            const numOr = (s: string, d: number): number => {
                const n = Number(s);
                return Number.isFinite(n) ? n : d;
            };
            const bw = numOr(await attrRaw("theme.floating.border_width"), 2);
            const left = Math.max(0, bw + numOr(await attrRaw("theme.floating.padding_left"), 0));
            const top = Math.max(0, bw + numOr(await attrRaw("theme.floating.padding_top"), 0)
                + numOr(await attrRaw("theme.floating.title_height"), 0)
                + numOr(await attrRaw("theme.floating.title_depth"), 0));
            await helper("hc_resize", [tilingWid, `${w}x${h}+${left}+${top}`]);
        }
    }

    if (floatWid && floatWid !== tilingWid
        && (await hc("attr", "tags.focus.floating_focused", "on")) !== null) {
        // a pre-existing float: recall it — focus only, no un-float —
        // then center it to root. The pre-scanned wid is PRIMARY
        // (clients.focus may lag a settle-tick after the layer
        // switch); a failed layer-focus write (vanished float) skips
        // the centering — it would re-position the companion.
        await hc("jumpto", floatWid);
        await helper("hc_center", ["root"]);
        return;
    }
    if (tilingWid) {
        // no pre-existing float: the companion IS the float session's
        // focus now — register the layer (the hc_floatx yank
        // convention: floating on + floating_focused on) and leave it
        // in the corner. NO jumpto (already focused), NO hc_center
        // (the corner placement is the point).
        await hc("attr", "tags.focus.floating_focused", "on");
    }
}
