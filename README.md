# herbctl

kine's herbstluftwm controller: window-manager-optimised commands.
The hlwm keybind imperative layer — the dots keybind chains and the
float keybind state machines — as `herbctl <verb>` CLI subcommands
and importable functions.

[![CI](https://img.shields.io/github/actions/workflow/herbctl/ci.yml)](https://github.com/akinevz2/herbctl/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Project page: [akinevz.com/herbctl](https://akinevz.com/herbctl)

## Install

The package's `bin` entry is a TypeScript source (`src/index.ts`).
Install and run it with bun:

```sh
bun install          # or: bun add herbctl
bunx herbctl         # runs src/index.ts through bun's runtime
```

> **Note:** use bun or bunx, not npx — npx does not handle the
> TypeScript `bin` sources correctly.

For a standalone binary (the form the dots keybinds use), build it
with bunli:

```sh
git clone https://github.com/akinevz2/herbctl ./herbctl
cd ./herbctl
bun install
bun x bunli build    # -> dist/herbctl
```

## What it does

- **Imperative compositions** — every verb issues the same hlwm chains
  the source keybinding expresses (frame splitting, focus cycling,
  float state machines, zoom, yank/put).
- **Fail-soft throughout** — a failed herbstclient call resolves to a
  no-op with a stderr note, never a crashed keybind (the dots wrapper
  convention).

See `herbctl --help` for the full verb list.

## Dependencies

- [herbstutil](https://github.com/akinevz2/herbstutil) — the
  herbstclient attr compatibility layer this builds on.

## Test

Every command is verified against the recorded argv of a mocked
`herbstclient` binary (plus mocked helper binaries) — `bun test`
covers the full verb set; nothing here needs a live WM to test.
