// Open Graph and Twitter Card tags, written into the HTML the server sends.
//
// The app is a single-page app, so link previews (Slack, X, iMessage, LinkedIn…)
// only see static HTML: they don't run JavaScript. At build time this writes the
// site-wide tags into dist/index.html, plus one page per address under dist/og/:
// og/studio.html for the catalog and og/studio/<id>.html with each visualization's
// name, summary and catalog picture. nginx serves them for /studio and
// /studio/<id> (`try_files $uri /og$uri.html $uri/ /index.html`, see
// deploy/nginx-brain-harness.conf), so shared links get a matching preview with no
// server code. Without that rule every page falls back to the site-wide tags.
// They live under og/ (not studio/) so dist/ has no studio/ folder: nginx would
// otherwise answer /studio with a redirect to /studio/.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_NAME, APP_TITLE, APP_DESCRIPTION, AUTHOR, LOGO_PATH, SITE_IMAGE_PATH, pageTitle } from "../src/site.js";

const START = "<!--og:start-->";
const END = "<!--og:end-->";

export const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `base` + `p` as an absolute URL when a base is known (link previews need one). */
const abs = (base, p) => (base ? base.replace(/\/+$/, "") + p : p);

/** The <head> tags for one page. */
export function headTags({ title, description, pagePath, imagePath, imageAlt, baseUrl }) {
  const e = escapeHtml;
  const image = abs(baseUrl, imagePath);
  const url = abs(baseUrl, pagePath);
  return [
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(description)}" />`,
    `<meta name="author" content="${e(AUTHOR)}" />`,
    `<link rel="icon" type="image/png" href="${LOGO_PATH}" />`,
    `<link rel="apple-touch-icon" href="${LOGO_PATH}" />`,
    baseUrl ? `<link rel="canonical" href="${e(url)}" />` : null,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${e(APP_NAME)}" />`,
    `<meta property="og:title" content="${e(title)}" />`,
    `<meta property="og:description" content="${e(description)}" />`,
    `<meta property="og:url" content="${e(url)}" />`,
    `<meta property="og:image" content="${e(image)}" />`,
    `<meta property="og:image:type" content="image/webp" />`,
    `<meta property="og:image:width" content="320" />`,
    `<meta property="og:image:height" content="240" />`,
    `<meta property="og:image:alt" content="${e(imageAlt)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${e(title)}" />`,
    `<meta name="twitter:description" content="${e(description)}" />`,
    `<meta name="twitter:image" content="${e(image)}" />`,
  ]
    .filter(Boolean)
    .join("\n    ");
}

export const siteTags = (baseUrl) =>
  headTags({
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    pagePath: "/studio",
    imagePath: SITE_IMAGE_PATH,
    imageAlt: "The Julia set, one of the visualizations",
    baseUrl,
  });

export function vizTags(entry, baseUrl) {
  return headTags({
    title: pageTitle(entry.name),
    description: entry.summary,
    pagePath: `/studio/${entry.id}`,
    imagePath: `/thumbs/${entry.id}.webp`,
    imageAlt: `A sample picture of ${entry.name}`,
    baseUrl,
  });
}

/** Replaces the tags between the og markers (and the markers' <title>) in an HTML page. */
export function withTags(html, tags) {
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error(`index.html needs ${START} … ${END} in its <head>`);
  return html.slice(0, a + START.length) + "\n    " + tags + "\n    " + html.slice(b);
}

/** Every page to write: [path under dist, html]. */
export function openGraphPages(html, catalog, baseUrl) {
  return [
    ["index.html", withTags(html, siteTags(baseUrl))],
    ["og/studio.html", withTags(html, siteTags(baseUrl))],
    ...catalog.map((e) => [`og/studio/${e.id}.html`, withTags(html, vizTags(e, baseUrl))]),
  ];
}

/**
 * Vite plugin. The site tags go into index.html in dev and build; the build also
 * writes the per-visualization pages. PUBLIC_URL (set by the deploy workflow)
 * makes the URLs absolute, which link previews require.
 */
export function openGraph() {
  let outDir;
  const baseUrl = () => process.env.PUBLIC_URL || "";
  return {
    name: "open-graph-pages",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return withTags(html, siteTags(baseUrl()));
    },
    async closeBundle() {
      if (!outDir) return;
      let html;
      try {
        html = await readFile(path.join(outDir, "index.html"), "utf8");
      } catch {
        return; // not a client build (e.g. tests)
      }
      const { CATALOG } = await import("../src/studio/catalog.js");
      if (!baseUrl()) this.warn("PUBLIC_URL is not set: Open Graph URLs are relative, so link previews may not show the picture.");
      for (const [file, page] of openGraphPages(html, CATALOG, baseUrl())) {
        const out = path.join(outDir, file);
        await mkdir(path.dirname(out), { recursive: true });
        await writeFile(out, page);
      }
    },
  };
}
