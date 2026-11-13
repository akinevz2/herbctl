// src/commands/close-window.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { closeWindow } from "../lib/chains.js";

export default navCommand("close-window", 'Un-float or close', closeWindow);
