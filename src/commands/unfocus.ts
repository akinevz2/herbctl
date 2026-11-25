// src/commands/unfocus.ts — leave the float layer / create it (the
// $ModCtrl-z half machine; reparented from `float unfocus`).
import { defineCommand } from "@bunli/core";

import { floatUnfocus } from "../lib/float-unfocus.js";

export default defineCommand({
    name: "unfocus" as never,
    description: "leave the float layer / create the float session",
    handler: async () => {
        await floatUnfocus();
    },
});
