// src/commands/new-frame.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { newFrame } from "../lib/chains.js";

export default navCommand("new-frame", 'Split, cycle frame', newFrame);
