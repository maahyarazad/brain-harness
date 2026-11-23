// @vitest-environment node
// Open Graph tags in the HTML the server sends (build/openGraph.js).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openGraphPages, escapeHtml, withTags } from "../../build/openGraph.js";
import { CATALOG } from "../studio/catalog.js";

const INDEX = readFileSync(fileURLToPath(new URL("../../index.html", import.meta.url)), "utf8");
const BASE = "http://example.test";
const pages = Object.fromEntries(openGraphPages(INDEX, CATALOG, BASE));

/** The content of <meta property|name="key">. */
function meta(html, key) {
  const m = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html);
  return m?.[1];
}

test("one page for the site, the catalog and each of the 23 visualizations", () => {
  expect(Object.keys(pages)).toEqual(["index.html", "og/studio.html", ...CATALOG.map((e) => `og/studio/${e.id}.html`)]);
  expect(CATALOG).toHaveLength(23);
});

test("the site page names the app and uses the Julia set picture", () => {
  const html = pages["index.html"];
  expect(html).toContain("<title>Visualization Playground by Maahyar Azad</title>");
  expect(meta(html, "og:title")).toBe("Visualization Playground by Maahyar Azad");
  expect(meta(html, "og:site_name")).toBe("Visualization Playground");
  expect(meta(html, "og:image")).toBe(`${BASE}/thumbs/julia.webp`);
  expect(meta(html, "og:url")).toBe(`${BASE}/studio`);
  expect(meta(html, "author")).toBe("Maahyar Azad");
  expect(html).toContain('<link rel="icon" type="image/png" href="/logo.png" />');
});

test.each(CATALOG.map((e) => [e.id, e]))("%s has its own title, summary and picture", (id, e) => {
  const html = pages[`og/studio/${id}.html`];
  expect(meta(html, "og:title")).toBe(escapeHtml(`${e.name} · Visualization Playground`));
  expect(meta(html, "og:description")).toBe(escapeHtml(e.summary));
  expect(meta(html, "og:image")).toBe(`${BASE}/thumbs/${id}.webp`);
  expect(meta(html, "twitter:image")).toBe(`${BASE}/thumbs/${id}.webp`);
  expect(meta(html, "og:url")).toBe(`${BASE}/studio/${id}`);
  // Exactly one title, and the rest of the page (scripts, root) untouched.
  expect(html.match(/<title>/g)).toHaveLength(1);
  expect(html).toContain('<div id="root"></div>');
});

test("text is escaped", () => {
  expect(escapeHtml(`a "b" <c> & d`)).toBe("a &quot;b&quot; &lt;c&gt; &amp; d");
});

test("without a public URL the links are relative", () => {
  const [, html] = openGraphPages(INDEX, CATALOG, "")[2];
  expect(meta(html, "og:image")).toMatch(/^\/thumbs\//);
  expect(html).not.toContain('rel="canonical"');
});

test("index.html must keep the markers", () => {
  expect(() => withTags("<head><title>x</title></head>", "")).toThrow(/og:start/);
});

test("the logo and site picture exist", () => {
  for (const p of ["../../public/logo.png", "../../public/thumbs/julia.webp"]) {
    expect(() => readFileSync(fileURLToPath(new URL(p, import.meta.url)))).not.toThrow();
  }
});
