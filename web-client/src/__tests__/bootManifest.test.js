// @vitest-environment node
// The list of first-screen assets written to dist/boot-assets.json for the server (build/bootAssets.js).
import { collectBootAssets, bootAssets, BOOT_ASSETS_FILE } from "../../build/bootAssets.js";

const chunk = (o) => ({ type: "chunk", code: "x".repeat(o.bytes ?? 10), imports: [], dynamicImports: [], viteMetadata: { importedCss: new Set() }, ...o });

const bundle = {
  "assets/index-1.js": chunk({ fileName: "assets/index-1.js", isEntry: true, bytes: 100, imports: ["assets/chunk-2.js"], dynamicImports: ["assets/StudioPage-3.js", "assets/App-4.js", "assets/mandelbrot-5.js"], viteMetadata: { importedCss: new Set(["assets/index-1.css"]) } }),
  "assets/chunk-2.js": chunk({ fileName: "assets/chunk-2.js", bytes: 200 }),
  "assets/StudioPage-3.js": chunk({ fileName: "assets/StudioPage-3.js", facadeModuleId: "/x/src/studio/StudioPage.jsx", bytes: 300, viteMetadata: { importedCss: new Set(["assets/StudioPage-3.css"]) } }),
  "assets/App-4.js": chunk({ fileName: "assets/App-4.js", facadeModuleId: "/x/src/App.jsx" }),
  "assets/mandelbrot-5.js": chunk({ fileName: "assets/mandelbrot-5.js" }),
  "assets/index-1.css": { type: "asset", fileName: "assets/index-1.css", source: "c".repeat(40) },
  "assets/StudioPage-3.css": { type: "asset", fileName: "assets/StudioPage-3.css", source: new Uint8Array(60) },
};
const publicFiles = [{ url: "/logo.png", size: 5 }, { url: "/thumbs/julia.webp", size: 7 }];

test("lists the entry, its imports, the studio chunk, the CSS and the public files, and nothing else", () => {
  const list = collectBootAssets(bundle, { publicFiles });
  const urls = list.map((a) => a.url).sort();
  expect(urls).toEqual(
    ["/assets/StudioPage-3.css", "/assets/StudioPage-3.js", "/assets/chunk-2.js", "/assets/index-1.css", "/assets/index-1.js", "/logo.png", "/thumbs/julia.webp"].sort()
  );
  expect(list.find((a) => a.url === "/assets/chunk-2.js").size).toBe(200);
  expect(list.find((a) => a.url === "/assets/index-1.css").size).toBe(40);
  expect(list.find((a) => a.url === "/assets/StudioPage-3.css").size).toBe(60);
  expect(new Set(urls).size).toBe(urls.length);
  expect(urls.some((u) => u.includes("mandelbrot") || u.includes("App-"))).toBe(false);
});

test("the plugin emits the list as boot-assets.json", () => {
  const plugin = bootAssets();
  plugin.configResolved({ publicDir: "/nonexistent-public-dir" }); // no public files: just the bundle's
  const emitted = [];
  plugin.generateBundle.call({ emitFile: (f) => emitted.push(f) }, {}, bundle);
  expect(emitted).toHaveLength(1);
  expect(emitted[0]).toMatchObject({ type: "asset", fileName: BOOT_ASSETS_FILE });
  const list = JSON.parse(emitted[0].source);
  expect(list.map((a) => a.url)).toContain("/assets/index-1.js");
  expect(list.every((a) => a.url.startsWith("/") && a.size > 0)).toBe(true);
});
