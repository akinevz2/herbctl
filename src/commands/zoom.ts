// src/commands/zoom.ts
// (see src/lib/zoom.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { } from "../lib/chains.js";
import { zoomToggle } from "../lib/zoom.js";

export default navCommand("zoom", 'Float-max-restore', zoomToggle);
