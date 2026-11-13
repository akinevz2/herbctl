// src/commands/float-focus.ts
// (see src/lib/focus.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { } from "../lib/chains.js";
import { floatFocus } from "../lib/float-focus.js";

export default navCommand("float-focus", 'Float register/focus', floatFocus);
