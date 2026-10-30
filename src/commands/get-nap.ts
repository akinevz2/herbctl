// src/commands/get-nap.ts — bunli verb for the getNap chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getNap } from "../lib/chains.js";

export default navCommand("get-nap", '[$ModShift-z] Minimized toggle on the focused client', getNap);
