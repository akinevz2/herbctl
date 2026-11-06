// src/commands/get-extracted.ts — bunli verb for the floatYank chain
// (see src/lib/extracted.ts for the port and the source binding).
import { navCommand } from "../lib/chains.js";
import { floatYank } from "../lib/extracted.js";

export default navCommand("float-yank", '[hc_floatx, $Mod-x] Layer-yank machine (yank/defer/slurp)', floatYank);
