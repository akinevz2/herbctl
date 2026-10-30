// src/commands/get-wrench.ts — bunli verb for the getWrench chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getWrench } from "../lib/chains.js";

export default navCommand("get-wrench", '[$ModCtrl-q] xkill-or-close: a focused client gets xkill, else close_and_remove', getWrench);
