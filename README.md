# herbctl

[![CI](https://img.shields.io/github/actions/workflow/status/akinevz2/herbctl/ci.yml?branch=main&label=CI&style=flat&pretty=deferred)](https://github.com/akinevz2/herbctl/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/akinevz2/herbctl)](LICENSE)

The hlwm keybind state machines. herbctl owns the IMPERATIVE
compositions — the dots keybind chains and the float keybind state
machines — as `herbctl <verb>` CLI subcommands and importable
functions. The pure parse/attr compatibility layer lives in
[herbstutil](https://github.com/akinevz2/herbstutil).

Early release.

# Usage

```bash
herbctl get-<name>    # run one keybind state machine (see the table below)
```

# Commands

Each function issues the SAME hlwm chains the source binding expresses,
token for token (ports of the herbstluftwm package's
`keys.d/{focus,nav,floating}.sh` fragments, the autostart, and the
`hc_zoom`/`hc_floatx`/`hc_focus` state machines). Fail-soft throughout
(the dots wrapper convention): a failed `herbstclient` call (missing
object, vanished window, 5s timeout) resolves null instead of throwing
— a vanished window may never wedge the bar or the keybind.

| command | serves (hlwm keybind / script) | behavior |
|---------|--------------------------------|----------|
| `get-south` / `getSouth()` | `$Mod-s` (focus.sh) | zoom/peek grid: urgent jumpto, `focus --level=frame down`, the floating-layer branch (`attr tags.focus.floating_focused true` — focuses the float layer AND fails through when it is empty), cycle fallbacks, pseudotile toggle — one chained spawn under lock |
| `get-forward` / `getForward()` | `$Mod-w` (nav.sh) | leave the floating layer, then cycle window/frame upward — under lock |
| `get-deck` / `getDeck()` | `$Mod-d` (nav.sh) | count-gated `cycle_layout` mixes (4+ windows, exactly 2) with a bare `-1` fallback |
| `get-dedeck` / `getDedeck()` | `$ModShift-d` (nav.sh) | with >1 window in the frame mix in the max/grid/vertical layouts, else remove the focused frame |
| `get-explore` / `getExplore()` | `$Mod-e` (focus.sh) | cycle frames backward, or `split explode` when it is the last split |
| `get-advice` / `getAdvice()` | `$Mod-a` (autostart) | `focus left --level=frame`, or `split left 0.33333` |
| `get-shuffle` / `getShuffle()` | `$ModShift-w` (nav.sh) | the shift-up ladder: `shift --level=all up`, else cycle `-1` (with >1 window) / cycle+rotate frames |
| `get-rotate` / `getRotate()` | `$ModCtrl-r` (focus.sh) | rotate the tree (<3 frames) or cycle frames forward; a single frame cycles windows `+1` |
| `get-skip` / `getSkip()` | `$ModShift-s` (nav.sh) | empty focused frame -> `remove`; multi-window frame -> `shift down`, splitting a bottom frame first when there is nothing below; a lone window in a multi-frame tag does nothing |
| `get-below` / `getBelow()` | `$ModShift-b` (autostart) | with >1 window in the frame: `split bottom` + `shift down` |
| `get-dive` / `getDive()` | `$ModCtrl-a` (autostart) | `shift left`, else `focus left --level=frame`, else `split left` + `shift left` |
| `get-toss` / `getToss()` | `$ModCtrl-e` (autostart) | `shift right`, else `split right` + `focus --level=frame right` |
| `get-tuck` / `getTuck()` | `$ModShift-t` (autostart, FRAME HALF ONLY) | `split auto` + `cycle_frame` only when the focused frame holds >0 windows; an empty frame stays as is. The `spawn $TERMINAL` half is a dotfiles concern — herbctl never spawns terminals; the dots keybind chains this with the spawn |
| `get-hold` / `getHold()` | `$ModShift-q` (autostart) | a focused float is closed and its frame removed; otherwise `close_or_remove` |
| `get-wrench` / `getWrench()` | `$ModCtrl-q` (autostart) | xkill-or-close: a focused client exists -> `spawn xkill`, else `close_and_remove` |
| `get-vex` / `getVex()` | `$Mod-v` (autostart) | `split right 0.5` + `cycle_frame` |
| `get-bend` / `getBend()` | `$Mod-b` (autostart) | `focus --level=frame down`, else `split bottom 0.5` + `cycle_frame` |
| `get-vexi` / `getVexi()` | `$ModCtrl-v` (autostart) | `split right 0.5` + `focus -e right` |
| `get-bendi` / `getBendi()` | `$ModCtrl-b` (autostart) | `split bottom 0.5` + `focus -i down` |
| `get-quiet` / `getQuiet()` | `$Mod-q` (floating.sh) | a focused float is ONLY un-floated; tiling windows get closed, with a lone-window frame removed afterwards — under lock |
| `get-hush` / `getHush()` | `$ModShift-f` (floating.sh) | fullscreen toggle on the focused client |
| `get-nap` / `getNap()` | `$ModShift-z` (nav.sh) | minimized toggle on the focused client |
| `get-zoom` / `getZoom()` | `hc_zoom`, bound **$ModCtrl-f** | the three-state press machine: tiled -> float (flag reset + center + deco-flush frame fill + fit) / floating -> maximize onto `<tag>-max` / maximized -> restore. The `-max` check runs BEFORE the floating check; PF_MAX state is owned by the delegated `hc_maximize`/`hc_unmaximize` helpers (and their daemon). Exit 1 when no window is focused |
| `get-extracted` / `getExtracted()` | `hc_floatx`, `$Mod-x` | the layer-yank machine: focus-a-float-then-unfloat / yank (float + center into the float session, frame left alone) / defer / un-float-into-empty-frame / tidying (remove, reveal, `polyframes hidden`, `use_previous`) |
| `get-focus` / `getFocus()` | `hc_focus`, `$Mod-f` | the float-register machine: try focusing a float (un-float it into an EMPTY focused frame; with children the float stays, no stacking) / no floats + max layout -> the size-keeping lift (`hc_center frame` + vacated-frame `remove` + `hc_fit_to frame`, then the `algorithm=max` tail) / a focused float -> DIRECT un-float (no hc_tile). No script-level lock |

Small imperatives (importable, shared building blocks of the machines
above):

- `unfloatWid(wid)` — fold fullscreen/pseudotile/floating flags off a
  float and `jumpto` it (hc_floatx's `unfloat_wid`).
- `floatCenterFrame(wid)` — float a window and center it within the
  focused frame's content geometry, under a lock (the scroll wheel's
  float step).
- `minimizeKeepFrame(wid)` — minimize while deliberately keeping the
  frame (the scroll wheel's tiled step down).
- `removeEmptyFrame()` — prune the focused frame when the tag has more
  than one frame and the focused one holds zero clients.

```ts
import { getSouth, getFocus } from "herbctl/src/lib/chains.js";
import { getZoom } from "herbctl/src/lib/zoom.js";
import { unfloatWid, floatCenterFrame } from "herbctl/src/lib/imperatives.js";
```

# The herbstutil dependency

herbctl imports herbstutil for its PURE primitives only — the
parse/attr compatibility layer (`parseAttr`, the typed attribute
reader). herbctl does NOT (and must not) import herbstutil's command
functions: the composite keybind commands live here, and herbstutil
ships none of them.

**Local resolution:** herbstutil is NOT yet on npm, so the dependency
is declared as `"herbstutil": "file:../herbstutil"` (a symlinked local
path — the sibling checkout in `~/development/system/`). Once
herbstutil is published, flip the dependency to the intended
`"herbstutil": "^0.2.0"` and drop the `file:` override — no code
changes needed.

# Helper binaries

The state machines delegate to the dots helper binaries exactly where
the scripts do — `hc_center`, `hc_resize`, `hc_fit_to`, `hc_tile`,
`hc_maximize`, `hc_unmaximize` and `polyframes` — resolved from
`$HOME/.local/bin` by default. Override the directory (tests point it
at a fixture dir) with:

```bash
HERBSTCTL_HELPER_DIR=/path/to/bin herbctl get-extracted
```

Every spawn (herbstclient and helpers) carries the 5-second timeout
inherited from herbstutil's spawn layer — the dots wrapper convention:
a hung WM may never wedge the bar or the keybind.

# Tests

Every command is verified against the recorded argv of a mocked
`herbstclient` binary (plus mocked helper binaries) — `bun test`
covers all 25 commands; nothing here needs a live WM to test.
