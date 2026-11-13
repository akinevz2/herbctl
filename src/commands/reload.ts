// src/commands/reload.ts
// (herbstclient reload + the theme reload, when the helper exists).
import { navCommand } from "../lib/nav-command.js";
import { } from "../lib/chains.js";
import { reload } from "../lib/imperatives.js";

export default navCommand("reload", '[hc_reload_hook] herbstclient reload + reload_theme --force (when the helper exists)', reload);
