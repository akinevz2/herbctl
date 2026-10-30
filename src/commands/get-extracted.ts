// src/commands/get-extracted.ts — bunli verb for the getExtracted chain
// (see src/lib/extracted.ts for the port and the source binding).
import { navCommand } from "../lib/chains.js";
import { getExtracted } from "../lib/extracted.js";

export default navCommand("get-extracted", '[hc_floatx, $Mod-x] Layer-yank state machine: focus-a-float-then-unfloat / yank / defer / slurp / tidying', getExtracted);
