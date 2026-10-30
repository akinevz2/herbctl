// src/commands/get-below.ts — bunli verb for the getBelow chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getBelow } from "../lib/chains.js";

export default navCommand("get-below", '[$ModShift-b] Split a bottom frame and shift the window down into it', getBelow);
