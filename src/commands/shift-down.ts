// src/commands/shift-down.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { shiftDown } from "../lib/chains.js";

export default navCommand("shift-down", 'Shift down or remove', shiftDown);
