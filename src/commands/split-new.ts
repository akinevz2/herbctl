// src/commands/split-new.ts — split the focused frame along hlwm's
// `split auto` direction and tile the FOCUSED window into the new
// empty half (the $ModShift-e chain: `chain . split auto . spawn
// hc_tile` — now one verb; the self-locking tile() machine navigates
// to the freshly emptied child and inserts the window).
import { defineCommand } from "@bunli/core";

import { hc } from "../lib/hc.js";
import { tile } from "../lib/tile.js";

export default defineCommand({
    name: "split-new" as never,
    description: "Split auto + tile",
    handler: async () => {
        await hc("split", "auto");
        await tile();
    },
});
