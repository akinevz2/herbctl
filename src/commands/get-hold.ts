// src/commands/get-hold.ts — bunli verb for the getHold chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getHold } from "../lib/chains.js";

export default navCommand("get-hold", '[$ModShift-q] Close a focused float (frame removed), else close_or_remove', getHold);
