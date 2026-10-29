import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server forwards API calls to the Brain Harness server, so the
// browser only ever talks to one origin (no CORS, and no API key in the page).
const SERVER = "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": SERVER,
      "/health": SERVER,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/__tests__/setup.js",
  },
});
