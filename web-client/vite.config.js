import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// The dev server forwards API calls to the Brain Harness server, so the
// browser only ever talks to one origin (no CORS, and no API key in the page).
const SERVER = "http://127.0.0.1:3000";

const THUMBS_DIR = fileURLToPath(new URL("./public/studio/thumbs/", import.meta.url));
const CATALOG_FILE = fileURLToPath(new URL("./src/studio/catalog.js", import.meta.url));
const MAX_THUMB_BYTES = 200 * 1024;

/**
 * Development only: lets the /studio/__thumbnails page save the catalog pictures
 * (PUT /__thumbs/<id>.webp → public/studio/thumbs/<id>.webp). Not part of builds.
 */
function thumbnailWriter() {
  return {
    name: "studio-thumbnail-writer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__thumbs/", (req, res) => {
        const reply = (code, msg = "") => {
          res.statusCode = code;
          res.end(msg);
        };
        if (req.method !== "PUT") return reply(405, "Use PUT.");
        const m = /^\/([a-z0-9-]+)\.webp$/.exec(req.url ?? "");
        // Read the ids each time, so a new catalog entry works without a restart.
        const ids = new Set([...readFileSync(CATALOG_FILE, "utf8").matchAll(/\be\("([a-z0-9-]+)"/g)].map((x) => x[1]));
        if (!m || !ids.has(m[1])) return reply(400, "Unknown visualization id.");
        const chunks = [];
        let size = 0;
        req.on("data", (c) => {
          size += c.length;
          if (size > MAX_THUMB_BYTES) {
            reply(413, "Too large.");
            req.destroy();
          } else chunks.push(c);
        });
        req.on("end", async () => {
          if (size > MAX_THUMB_BYTES) return;
          const body = Buffer.concat(chunks);
          if (body.toString("latin1", 0, 4) !== "RIFF" || body.toString("latin1", 8, 12) !== "WEBP") {
            return reply(400, "Not a WebP image.");
          }
          try {
            await mkdir(THUMBS_DIR, { recursive: true });
            await writeFile(`${THUMBS_DIR}${m[1]}.webp`, body);
            reply(204);
          } catch (err) {
            reply(500, String(err.message ?? err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), thumbnailWriter()],
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
    // The suite is CPU-bound (kernels run on the main thread under jsdom) and its
    // files run in parallel, so allow more than the 5 s default per test.
    testTimeout: 15000,
  },
});
