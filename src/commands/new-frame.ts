// src/commands/get-tuck.ts — bunli verb for the newFrame chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, newFrame } from "../lib/chains.js";

export default navCommand("new-frame", 'Split, cycle frame', newFrame);
