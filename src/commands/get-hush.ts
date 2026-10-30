// src/commands/get-hush.ts — bunli verb for the getHush chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getHush } from "../lib/chains.js";

export default navCommand("get-hush", '[$ModShift-f] Fullscreen toggle on the focused client', getHush);
