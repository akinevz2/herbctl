// src/commands/get-tuck.ts — bunli verb for the getTuck chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getTuck } from "../lib/chains.js";

export default navCommand("get-tuck", '[$ModShift-t frame half] Split auto + cycle_frame only when the frame holds windows (dots chain the $TERMINAL spawn)', getTuck);
