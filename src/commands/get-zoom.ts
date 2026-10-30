// src/commands/get-zoom.ts — bunli verb for the getZoom chain
// (see src/lib/zoom.ts for the port and the source binding).
import { navCommand } from "../lib/chains.js";
import { getZoom } from "../lib/zoom.js";

export default navCommand("get-zoom", '[hc_zoom, $ModCtrl-f] Three-state toggle: float (frame fill) -> <tag>-max maximize -> restore', getZoom);
