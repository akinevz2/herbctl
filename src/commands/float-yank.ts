// src/commands/float-yank.ts
// (see src/lib/extracted.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { } from "../lib/chains.js";
import { floatYank } from "../lib/extracted.js";

export default navCommand("float-yank", 'Yank/defer/slurp', floatYank);
