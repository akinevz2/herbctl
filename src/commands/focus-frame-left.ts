// src/commands/focus-frame-left.ts
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand } from "../lib/nav-command.js";
import { focusFrameLeft } from "../lib/chains.js";

export default navCommand("focus-frame-left", 'Focus or split left', focusFrameLeft);
