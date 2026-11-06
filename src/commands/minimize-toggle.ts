// src/commands/get-nap.ts — bunli verb for the minimizeToggle chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, minimizeToggle } from "../lib/chains.js";

export default navCommand("minimize-toggle", 'Minimize toggle', minimizeToggle);
