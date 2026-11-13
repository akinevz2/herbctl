// src/commands/minimize-toggle.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { minimizeToggle } from "../lib/chains.js";

export default navCommand("minimize-toggle", 'Minimize toggle', minimizeToggle);
