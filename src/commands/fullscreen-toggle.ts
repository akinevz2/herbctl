// src/commands/get-hush.ts — bunli verb for the fullscreenToggle chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, fullscreenToggle } from "../lib/chains.js";

export default navCommand("fullscreen-toggle", 'Fullscreen toggle', fullscreenToggle);
