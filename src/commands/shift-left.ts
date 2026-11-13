// src/commands/shift-left.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { shiftLeft } from "../lib/chains.js";

export default navCommand("shift-left", 'Shift or focus left', shiftLeft);
