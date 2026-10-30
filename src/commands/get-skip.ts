// src/commands/get-skip.ts — bunli verb for the getSkip chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getSkip } from "../lib/chains.js";

export default navCommand("get-skip", '[$ModShift-s] Empty frame removed; multi-window frame shifts down (splitting a bottom frame when needed)', getSkip);
