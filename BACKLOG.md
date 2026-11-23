# herbctl — backlog

## bare `herbctl` must print help, not open rofi

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
