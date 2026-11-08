// src/commands/reload.ts — bunli verb for the reload composition
// (herbstclient reload + the theme reload, when the helper exists).
import { navCommand } from "../lib/chains.js";
import { reload } from "../lib/imperatives.js";

export default navCommand("reload", '[hc_reload_hook] herbstclient reload + reload_theme --force (when the helper exists)', reload);
