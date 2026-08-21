import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// externalizeDepsPlugin keeps runtime `dependencies` (notably the native
// module @nut-tree-fork/nut-js) OUT of the main/preload bundles, so they are
// require()'d from node_modules at runtime instead of being bundled — native
// addons cannot be bundled. The renderer bundles normally (browser code).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
