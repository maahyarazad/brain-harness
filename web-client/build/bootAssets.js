// The list of assets the first screen needs, written to dist/boot-assets.json. The server
// (server/src/routes/site.js) puts it into every page it sends, so the loading screen
// (server/public/boot/) can show real progress. Built from the bundle: the entry
// chunk and its static imports, the studio page chunk, their CSS, and the logo and catalog
// pictures from public/. Visualization chunks and the Playground load on demand and are not
// listed.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const byteLength = (src) => (typeof src === "string" ? Buffer.byteLength(src) : src.byteLength);

export function collectBootAssets(bundle, { publicFiles = [] } = {}) {
  const out = new Map();
  const add = (url, size) => out.has(url) || out.set(url, { url, size });
  const entry = Object.values(bundle).find((o) => o.type === "chunk" && o.isEntry);
  const seen = new Set();

  function addChunk(chunk) {
    if (!chunk || seen.has(chunk.fileName)) return;
    seen.add(chunk.fileName);
    add("/" + chunk.fileName, byteLength(chunk.code));
    for (const css of chunk.viteMetadata?.importedCss ?? []) {
      const asset = bundle[css];
      if (asset) add("/" + css, byteLength(asset.source));
    }
    for (const name of chunk.imports ?? []) addChunk(bundle[name]);
  }

  addChunk(entry);
  addChunk(Object.values(bundle).find((o) => o.type === "chunk" && o.facadeModuleId?.endsWith("StudioPage.jsx")));
  for (const f of publicFiles) add(f.url, f.size);
  return [...out.values()];
}

/** /logo.png and /thumbs/*.webp from public/, with their sizes. */
export function listPublicFiles(publicDir) {
  const files = [];
  const add = (url, file) => {
    try {
      files.push({ url, size: statSync(file).size });
    } catch {
      /* not there: leave it out */
    }
  };
  add("/logo.png", path.join(publicDir, "logo.png"));
  try {
    for (const f of readdirSync(path.join(publicDir, "thumbs")).sort()) {
      if (f.endsWith(".webp")) add(`/thumbs/${f}`, path.join(publicDir, "thumbs", f));
    }
  } catch {
    /* no thumbs folder */
  }
  return files;
}

/** The file the server reads to put the list into every page. */
export const BOOT_ASSETS_FILE = "boot-assets.json";

export function bootAssets() {
  let publicDir;
  return {
    name: "boot-assets",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const list = collectBootAssets(bundle, { publicFiles: listPublicFiles(publicDir) });
      this.emitFile({ type: "asset", fileName: BOOT_ASSETS_FILE, source: JSON.stringify(list) });
    },
  };
}
