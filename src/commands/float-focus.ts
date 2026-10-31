// src/commands/get-focus.ts — bunli verb for the floatFocus chain
// (see src/lib/focus.ts for the port and the source binding).
import { navCommand } from "../lib/chains.js";
import { floatFocus } from "../lib/focus.js";

export default navCommand("float-focus", '[hc_focus, $Mod-f] Float-register machine: focus-a-float-and-unfloat / max-layout lift / direct un-float', floatFocus);
