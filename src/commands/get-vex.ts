// src/commands/get-vex.ts — bunli verb for the getVex chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getVex } from "../lib/chains.js";

export default navCommand("get-vex", '[$Mod-v] Split right at half and cycle into the new frame', getVex);
