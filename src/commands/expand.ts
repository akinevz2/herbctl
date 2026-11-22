// src/commands/expand.ts
// (see src/lib/expand.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { expandSplit } from "../lib/expand.js";

export default navCommand("expand", 'expand to max, else remove adjacent split', expandSplit);
