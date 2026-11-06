// src/commands/get-forward.ts — bunli verb for the getForward chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getForward } from "../lib/chains.js";

export default navCommand("get-forward", '[$Mod-w] Leave the float layer, cycle up', getForward);
