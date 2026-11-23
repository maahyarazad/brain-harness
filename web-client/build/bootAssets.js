// The list of assets the first screen needs, written into the HTML the server sends so
// the loading screen (src/boot/) can show real progress. Built from the bundle: the entry
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

export function injectBootAssets(html, assets) {
  if (!assets?.length) return html;
  const json = JSON.stringify(assets).replace(/</g, "\\u003c");
  const tag = `<script>window.__BOOT_ASSETS__=${json}</script>\n    `;
  const i = html.indexOf('<script type="module"');
  return i < 0 ? html : html.slice(0, i) + tag + html.slice(i);
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

export function bootAssets() {
  let publicDir;
  return {
    name: "boot-assets",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx?.bundle) return html; // dev server: no bundle, so no list
        return injectBootAssets(html, collectBootAssets(ctx.bundle, { publicFiles: listPublicFiles(publicDir) }));
      },
    },
  };
}
