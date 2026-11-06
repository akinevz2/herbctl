import { defineConfig } from "@bunli/core";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  ...pkg,

  commands: {
    directory: "./src/commands",
  },

  build: {
    entry: "./src/index.ts",
    outdir: "./dist",
    targets: ["native"],
    minify: true,
    sourcemap: true,
    compress: false,
  },

  test: {
    pattern: ["**/*.test.ts", "**/*.spec.ts"],
    coverage: true,
    watch: false,
  },

  plugins: [],
});
