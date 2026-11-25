// src/commands/xkill.ts — the targeted xkill, BARE (reparented from
// `close xkill`; the close dispatch surface retired): a focused client
// -> targeted xkill; else close_and_remove (the $ModCtrl-q chain).
// The machine lives in lib/chains.ts.
import { navCommand } from "../lib/nav-command.js";
import { xkillOrClose } from "../lib/chains.js";

export default navCommand("xkill", "targeted xkill", xkillOrClose);
