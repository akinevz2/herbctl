# herbctl — backlog

## DONE (unreleased) — `jump prev|next`: the tagspace cycler

The hc_tag-cycle reference implementation
(~/dots/herbstluftwm/.local/bin/hc_tag-cycle) is ported into herbctl
as two new jump directions:

    herbctl jump prev    # the previous POPULATED tag ($Mod-bracketleft)
    herbctl jump next    # the next POPULATED tag ($Mod-bracketright)

The walker (lib/chains.ts `tagCycle`) reads ONE `herbstclient
tag_status` (per-tag char + name, index order) plus
`tags.focus.index`, walks the ring in the requested direction, and
lands on the first tag whose status char is `:` (occupied, not
visible) or `!` (urgent). `.` (unoccupied) and `*` (visible on
another monitor) are skipped — the old `--skip-visible` semantics;
the focused tag (`#`) is the starting point, never a target. When no
other populated tag exists (or the WM is unreachable) the walker
STAYS PUT (the script's exit-0-and-stay).

The dots side rebinds the brackets to `spawn ~/.local/bin/herbctl
jump prev|next` and retires the hc_tag-cycle helper (single
implementation lives in herbctl, the geometry-machine precedent).
Outcome-level tests: tests/tag-cycle.test.ts (mock herbstclient).

## DONE v1.20.1 — bare `herbctl` must print help, not open rofi

Since v1.8.0 the bare invocation is the palette shorthand: `src/index.ts`
rewrites empty argv to `run`, which opens the rofi palette. That is the
wrong default for a CLI:

- scripts and humans typing `herbctl` expect the help surface (what the
  root `--help` used to print) — a rofi spawn from a non-WM context is
  noise, and from a WM context it steals the `hc_command` semantics that
  the keybind already carries explicitly.
- the palette stays reachable everywhere it is wanted: the `$Mod-c`
  keybind (`herbctl run`), the `hc_command` shim, and bare `herbctl run`.

Change: `src/index.ts` — the empty-argv branch rewrites to `--help`
(restore the pre-1.8.0 behavior); the palette keeps every explicit
entry point. Bump the patch version.

## DONE v1.20.1 — rename + verb-surface cleanup

 Implemented: `rotate-tree` → `rotate`, `tag` → `tag` (no
 aliases — no external callers); `open` is the rofi WM command
 selector (the former palette verb, renamed — the $Mod-c keybind
 points at it); the $TERMINAL launcher is `terminal` ($Mod-Enter);
 `run` REMOVED as a name (the palette lives on as `open`; the
 hc_command shim went with the rename); `spawn`/`launch` kept and
 marked as the automation surfaces in their help.

- **rename `rotate-tree` → `rotate`**, **`tag` → `tag`** (a
  tag IS an hlwm tag; the shorter name says it). Update the
  command modules, `.bunli/commands.gen.ts`, the autostart keybinds
  (`ModCtrl-r` / `ModCtrl-c` call `rotate-tree`), `herbctl-nav-cycle`'s
  comment, and any completions registry entries. Consider keeping the
  old names as hidden aliases for one release.
- **`open` becomes the `$TERMINAL` launcher** currently bound to
  `$Mod-Enter`. Today `open` is the rofi directory browser — that
  browser flow moves (or is superseded) so `open` means: launch the
  terminal, as `$Mod-Enter` does. Rebind the keybind to it.
- **remove `run`** — it duplicates the bare-`herbctl` palette
  shorthand; see the backlog item above (bare `herbctl` returns to
  help, so `run` loses its remaining excuse).
- **`spawn` and `launch` stay** (checked, not redundant):
  `spawn` is the typed one-shot `herbstclient rule once` machine plus
  the `spawn terminal` mode — internal-use plumbing for WM/agent
  automation (`launch_alacritty`-class flows, guard dialogs);
  `launch` is the rofi drun/run app launcher the autostart's
  APPLAUNCHER points at. Mark both as internal/automation surfaces in
  their help text rather than deleting.

## FIXED v1.20.1 — `run` palette: Shift-Return help buries the menu

 The palette survives as `open` — and the bug is fixed: after
 spawning the help terminal the loop WAITS for the terminal process
 to exit (pid liveness poll, 200 ms; a 1 h fail-open cap) before
 re-opening the rofi menu, so rofi never lands on top of the pager.

In the `run` completion palette, Shift-Return on an entry spawns the
floated help-terminal but then re-opens the rofi menu immediately —
rofi lands ON TOP of the help terminal and obscures it. Fix: after
spawning the help terminal, do not re-spawn the rofi menu until that
terminal closes (wait on the terminal process / a rule-based signal,
then re-open the palette).
