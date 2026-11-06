// src/commands/get-vexi.ts — bunli verb for the splitRightFocus chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, splitRightFocus } from "../lib/chains.js";

export default navCommand("split-right-focus", 'Split right, focus', splitRightFocus);
