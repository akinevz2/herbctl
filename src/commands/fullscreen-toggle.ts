// src/commands/fullscreen-toggle.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { fullscreenToggle } from "../lib/chains.js";

export default navCommand("fullscreen-toggle", 'Fullscreen toggle', fullscreenToggle);
