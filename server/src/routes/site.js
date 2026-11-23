// The website itself: the built web client, the loading screen's files, and the HTML pages.
//
// Files (scripts, styles, pictures, /tetris-loop.lottie, /boot/…) come from public/ and from
// the client's build folder (WEB_ROOT). Pages are never sent as plain files: every page the
// browser asks for (/, /studio, /studio/julia, /playground…) is the client's page with the
// loading screen put in (src/site/page.js). Like the nginx rule this replaces, a page with its
// own link-preview file (og/<path>.html, see web-client/build/openGraph.js) uses that one.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import { renderPage } from "../site/page.js";

const NOT_PAGES = /^\/(api(\/|$)|health$|mcp$)/;
const PAGE_PATH = /^\/[A-Za-z0-9_\-/]*$/; // no dots: a path with a file extension is a file, not a page

/** The page file for a URL path, or null when the path isn't a page. */
export function pageFileFor(pathname) {
  if (NOT_PAGES.test(pathname) || !PAGE_PATH.test(pathname) || pathname.includes("//")) return null;
  const clean = pathname.replace(/\/+$/, "");
  return clean === "" ? ["index.html"] : [`og${clean}.html`, "index.html"];
}

export default async function siteRoutes(app, { webRoot, publicDir }) {
  const roots = [publicDir, webRoot].filter((dir) => existsSync(dir));
  await app.register(fastifyStatic, {
    root: roots,
    index: false,
    // Pages are not files: let them fall through to the page handler below
    // (the "/" and "/assets" folders would otherwise answer 403).
    allowedPath: (pathname) => pageFileFor(pathname) === null,
    setHeaders(res, filePath) {
      // Built files in assets/ have the content's fingerprint in their names
      if (filePath.includes(`${path.sep}assets${path.sep}`)) res.header("cache-control", "public, max-age=31536000, immutable");
    },
  });

  async function readIfExists(file) {
    try {
      return await readFile(path.join(webRoot, file), "utf8");
    } catch {
      return null;
    }
  }

  async function bootAssets() {
    try {
      const list = JSON.parse((await readIfExists("boot-assets.json")) ?? "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split("?")[0];
    const candidates = request.method === "GET" || request.method === "HEAD" ? pageFileFor(pathname) : null;
    if (candidates) {
      for (const file of candidates) {
        const shell = await readIfExists(file);
        if (shell !== null) {
          return reply
            .code(200)
            .header("content-type", "text/html; charset=utf-8")
            .header("cache-control", "no-cache")
            .send(renderPage(shell, await bootAssets()));
        }
      }
    }
    return reply.code(404).send({ message: `Route ${request.method}:${pathname} not found`, error: "Not Found", statusCode: 404 });
  });
}
