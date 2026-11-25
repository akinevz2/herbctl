// src/commands/fullscreen.ts — the fullscreen toggle, BARE (reparented
// from `toggle fullscreen` — the toggle dispatch surface retired; the
// machine lives in lib/chains.ts, next to its minimize sibling).
import { navCommand } from "../lib/nav-command.js";
import { fullscreenToggle } from "../lib/chains.js";

export default navCommand("fullscreen", "fullscreen toggle", fullscreenToggle);
