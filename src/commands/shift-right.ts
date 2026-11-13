// src/commands/shift-right.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { shiftRight } from "../lib/chains.js";

export default navCommand("shift-right", 'Shift or split right', shiftRight);
