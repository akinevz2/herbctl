// src/commands/tagspace.ts — the focus-or-allocate tagspace shorthand
// (was: focus tagspace):
//
//   herbctl tagspace [name]
//
//   bare        enter the smallest free numeric tagspace (an
//               unallocated one is allocated — focus implies
//               allocation here)
//   [name]      an existing tagspace is entered; an unknown name is
//               allocated first
//
// A tagspace IS an hlwm tag (create = `herbstclient add`, enter =
// `use`); the machine lives in lib/allocate.js.
import { defineCommand } from "@bunli/core";

import { allocateTagspace } from "../lib/allocate.js";

export default defineCommand({
    name: "tagspace" as never,
    description: "tagspace [name] — enter, allocating when missing",
    handler: async ({ positional }) => {
        const name = positional[0];
        const tag = await allocateTagspace(true, name);
        if (tag === null) process.exit(1);
    },
});
