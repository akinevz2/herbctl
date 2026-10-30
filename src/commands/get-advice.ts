// src/commands/get-advice.ts — bunli verb for the getAdvice chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getAdvice } from "../lib/chains.js";

export default navCommand("get-advice", '[$Mod-a] Focus the frame left, or split one off at 1/3 width', getAdvice);
