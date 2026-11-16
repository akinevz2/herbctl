// src/commands/expand.ts
// (see src/lib/expand.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { expandSplit } from "../lib/expand.js";

export default navCommand("expand", 'Expand split to max; at max, remove adjacent empty split', expandSplit);
