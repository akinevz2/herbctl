import { defineConfig } from "@bunli/core";

export default defineConfig({
  name: "herbctl",
  version: "0.1.0",
  description: "The hlwm keybind state machines — navigation, float-layer and zoom compositions",

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
