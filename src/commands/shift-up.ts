// src/commands/shift-up.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { shiftUp } from "../lib/chains.js";

export default navCommand("shift-up", 'Shift window up', shiftUp);
