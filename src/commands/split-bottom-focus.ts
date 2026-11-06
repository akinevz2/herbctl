// src/commands/get-bendi.ts — bunli verb for the splitBottomFocus chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, splitBottomFocus } from "../lib/chains.js";

export default navCommand("split-bottom-focus", '[$ModCtrl-b] Split bottom at half, focus in', splitBottomFocus);
