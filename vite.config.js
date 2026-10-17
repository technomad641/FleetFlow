import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base is "./" so the production build works when served from a subpath
// (GitHub Pages serves the repo at /FleetFlow/).
export default defineConfig({
  base: "./",
  plugins: [react()],
});
