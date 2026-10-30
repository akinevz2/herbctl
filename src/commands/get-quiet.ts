// src/commands/get-quiet.ts — bunli verb for the getQuiet chain
// (see src/lib/chains.ts for the port and the source binding).
import { navCommand, getQuiet } from "../lib/chains.js";

export default navCommand("get-quiet", '[$Mod-q] Un-float a focused float, else close (lone-window frames removed)', getQuiet);
