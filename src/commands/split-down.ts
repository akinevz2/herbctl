// src/commands/split-down.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { splitDown } from "../lib/chains.js";

export default navCommand("split-down", 'Split + shift down', splitDown);
