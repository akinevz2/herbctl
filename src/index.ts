#!/usr/bin/env bun

import { createCLI } from "@bunli/core";

import { registerCompletions } from "./lib/completions.js";
import { name, version, description } from "../package.json" with { type: "json" };

import jump from "./commands/jump.js";
import shift from "./commands/shift.js";
import frame from "./commands/frame.js";
import split from "./commands/split.js";
import removeCmd from "./commands/remove.js";
import xkill from "./commands/xkill.js";
import dismiss from "./commands/dismiss.js";
import fullscreen from "./commands/fullscreen.js";
import minimize from "./commands/minimize.js";
import hiddenCmd from "./commands/hidden.js";
// the fullscreen/minimize pair — TOP-LEVEL (reparented from
// `toggle <fullscreen|minimize>`; the toggle dispatch surface retired)
// the float family — TOP-LEVEL (reparented from `float <mode>`; the
// geometry verbs' implementations are the lib command modules
// themselves, the machines are thin wrappers)
import yankCmd from "./commands/yank.js";
import focusCmd from "./commands/focus.js";
import unfocusCmd from "./commands/unfocus.js";
import floatCmd from "./commands/float.js";
import windowsCmd from "./commands/windows.js";
import centerCmd from "./lib/center.js";
import fitCmd from "./lib/fit.js";
import cornerCmd from "./lib/corner.js";
import resizeCmd from "./lib/verb-resize.js";
import rotateTree from "./commands/rotate.js";
import zoomToggle from "./commands/zoom.js";
import reload from "./commands/reload.js";
import tile from "./commands/tile.js";
import once from "./commands/once.js";
import move from "./commands/move.js";
import expand from "./commands/expand.js";
import openCmd from "./commands/open.js";
import terminalCmd from "./commands/terminal.js";
import trackCmd from "./commands/track.js";
import newCmd from "./commands/new.js";
import addCmd from "./commands/add.js";
import launchCmd from "./commands/launch.js";
import tagCmd from "./commands/tag.js";
import findCmd from "./commands/find.js";
import completionsCmd from "./commands/completions.js";

// convenience order (NOT alphabetical — see the sort removal below):
// the completions and --command-tree derive their order from this
// array. Groups, in order:
//   find / mutate / focus verbs, print-enumerate, add, remove,
//   uncategorised (nouns) last.
const COMMANDS = [
  // find + mutate/focus — the daily drivers
  findCmd,
  jump, shift, move,
  frame, zoomToggle,
  rotateTree, expand, tile,
  fullscreen, minimize, hiddenCmd, tagCmd,
  // the float family, top-level (the $Mod-x/-f machines and the
  // geometry verbs; the geometry verbs auto-float a tiled focused
  // window unless --floating-only)
  yankCmd, focusCmd, unfocusCmd, floatCmd, windowsCmd,
  centerCmd, fitCmd, cornerCmd, resizeCmd,
  reload,
  // the selector — the rofi WM command palette (`open`), and the
  // $Mod-Enter terminal launcher (`terminal`)
  openCmd, terminalCmd, completionsCmd,
  // add / once — once and launch are the WM/agent automation
  // surfaces; track is the orchestrator-observation surface
  // (the --sentry mode owns the notification surface)
  newCmd, addCmd, once, split, launchCmd,
  trackCmd,
  // remove — remove (the layer machines via flags), xkill, dismiss
  removeCmd, xkill, dismiss,
];

// The completion registry (lib/completions) fills ONCE at boot — the
// run palette and `completions --internal` both read it, no help-text
// scraping anywhere.
import { commandTreeText } from "./lib/commandTree.js";
import { type TailSpec, type ModeFlag } from "./lib/completions.js";
import { getTree } from "./lib/completions.js";

const VERB_TAILS: Record<string, TailSpec> = {
    tag: { name: "name", required: true, description: "the tag name" },
};

const MODE_FLAGS: Record<string, Record<string, ModeFlag[]>> = {
    tag: {
        free: [{ flag: "--empty", description: "free EVERY empty tag at once" }],
    },
    new: {
        terminal: [
            { flag: "--on", description: "attach on a remote tag (focus-stealing prevented)" },
            { flag: "--directory", description: "cd into <dir> first" },
        ],
    },
    add: {
        terminal: [
            { flag: "--on", description: "attach on a remote tag (focus-stealing prevented)" },
            { flag: "--directory", description: "cd into <dir> first" },
        ],
    },
};

// The COMMANDS array above is hand-ordered for convenience (find /
// mutate-focus → print-enumerate → add → remove → nouns last) — no
// sort here, every surface (palette, completions, help, --command-tree)
// renders in that order.
registerCompletions(COMMANDS, VERB_TAILS, MODE_FLAGS);

const cli = await createCLI({
  name,
  version,
  description,
});

for (const command of COMMANDS) {
  cli.command(command);
}

// The root help surface is bunli's (the herbstutil simplicity, 2026-11:
// bunli's renderer IS width-aware — renderRootHelp pairs columns at
// ctx.terminal.width — so nothing is hand-printed here). Bare `herbctl`
// and bare `--help`/`help` all delegate to bunli's root help; `help
// <verb>` and `<verb> help` delegate to the verb's own --help.
const argv = process.argv.slice(2);
if (argv.includes("--command-tree")) {
  // the FULL verb/parameter structure — the declarative facts, printed:
  // usage tokens, tail parameters (with the blank semantics), flags and
  // their mode-scoped relations. No prompts, no execution.
  console.log(commandTreeText(getTree(), VERB_TAILS, MODE_FLAGS));
  process.exit(0);
}
if (argv.length === 0) {
  // Bare `herbctl` prints the root help (restored pre-1.8.0
  // behavior; BACKLOG.md). The palette verb was removed — the WM
  // surfaces (once, launch) are invoked explicitly by their callers.
  process.argv = [process.argv[0], process.argv[1], "--help"];
} else if (argv[0] === "help") {
  const rest = argv.slice(1);
  // cli.run() re-reads process.argv — rewrite it, not the slice
  process.argv = [
    process.argv[0], process.argv[1],
    ...(rest.length === 0 ? ["--help"] : [...rest, "--help"]),
  ];
} else if (argv.length === 2 && argv[1] === "help") {
  process.argv = [process.argv[0], process.argv[1], argv[0], "--help"];
}

const [_node, _bin, command, ...args] = process.argv;
await cli.run([command ?? 'help', ...args]);
