// src/commands/focus-frame-down.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { focusFrameDown } from "../lib/chains.js";

export default navCommand("focus-frame-down", 'Focus or split down', focusFrameDown);
