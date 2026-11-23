import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { pageFileFor } from "../src/routes/site.js";

// A stand-in for the client's build folder (web-client/dist).
const SHELL = `<!doctype html>
<html><head><title>Site</title></head>
<body>
<div id="root"></div>
<script type="module" src="/assets/index-abc.js"></script>
</body></html>`;
const OG_STUDIO = SHELL.replace("<title>Site</title>", "<title>Catalog</title>");
const OG_JULIA = SHELL.replace("<title>Site</title>", "<title>Julia</title>");
const ASSETS = [{ url: "/assets/index-abc.js", size: 10 }];

let dir;
let app;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "site-"));
  await mkdir(path.join(dir, "assets"));
  await mkdir(path.join(dir, "og/studio"), { recursive: true });
  await writeFile(path.join(dir, "index.html"), SHELL);
  await writeFile(path.join(dir, "og/studio.html"), OG_STUDIO);
  await writeFile(path.join(dir, "og/studio/julia.html"), OG_JULIA);
  await writeFile(path.join(dir, "assets/index-abc.js"), "console.log(1)");
  await writeFile(path.join(dir, "logo.png"), "png");
  await writeFile(path.join(dir, "boot-assets.json"), JSON.stringify(ASSETS));
  app = buildApp({ logger: false, corsOrigins: [], webRoot: dir });
  await app.ready();
});
after(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

const get = (url) => app.inject({ method: "GET", url });

test("the root page is the client's page with the loading screen put in", async () => {
  const res = await get("/");
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /text\/html/);
  assert.equal(res.headers["cache-control"], "no-cache");
  const html = res.body;
  assert.match(html, /<title>Site<\/title>/);
  assert.match(html, /<body>\s*<div id="boot-loader"/); // the loading screen comes first in <body>
  assert.ok(html.indexOf('id="boot-loader"') < html.indexOf('id="root"'));
  assert.match(html, /#boot-anim \{\s*width: 100px;\s*height: 100px;\s*max-width: 100px;\s*max-height: 100px;/);
  assert.match(html, /id="boot-percent">0%</);
  // scripts: the asset list, then the loading screen, then the app
  const list = html.indexOf("window.__BOOT_ASSETS__=");
  const boot = html.indexOf('src="/boot/index.js"');
  const client = html.indexOf('src="/assets/index-abc.js"');
  assert.ok(list > 0 && list < boot && boot < client);
  assert.ok(html.includes('"url":"/assets/index-abc.js","size":10'));
});

test("pages use their own link-preview file when there is one, else the site page", async () => {
  assert.match((await get("/studio")).body, /<title>Catalog<\/title>/);
  assert.match((await get("/studio/")).body, /<title>Catalog<\/title>/);
  assert.match((await get("/studio/julia")).body, /<title>Julia<\/title>/);
  assert.match((await get("/studio/mandelbrot")).body, /<title>Site<\/title>/);
  assert.match((await get("/studio/saved/abc")).body, /<title>Site<\/title>/);
  assert.match((await get("/playground")).body, /<title>Site<\/title>/);
  assert.match((await get("/anything/else")).body, /<title>Site<\/title>/);
  for (const url of ["/", "/studio", "/studio/julia", "/playground"]) assert.match((await get(url)).body, /id="boot-loader"/);
});

test("the query string doesn't change the page", async () => {
  assert.match((await get("/studio?q=spiral&category=fractals")).body, /<title>Catalog<\/title>/);
});

test("HEAD works for pages", async () => {
  const res = await app.inject({ method: "HEAD", url: "/studio" });
  assert.equal(res.statusCode, 200);
});

test("the animation, the player and its wasm are served by the server", async () => {
  const lottie = await get("/tetris-loop.lottie");
  assert.equal(lottie.statusCode, 200);
  assert.equal(lottie.rawPayload.subarray(0, 2).toString(), "PK"); // a .lottie file is a zip
  const player = await get("/boot/dotlottie-wc.js");
  assert.equal(player.statusCode, 200);
  assert.match(player.headers["content-type"], /javascript/);
  assert.match(player.body, /setWasmUrl/);
  const wasm = await get("/boot/dotlottie-player.wasm");
  assert.equal(wasm.statusCode, 200);
  assert.match(wasm.headers["content-type"], /application\/wasm/);
  for (const f of ["index.js", "loader.js", "progress.js"]) assert.equal((await get(`/boot/${f}`)).statusCode, 200, f);
});

test("the client's files are served, and fingerprinted ones are cached for good", async () => {
  const js = await get("/assets/index-abc.js");
  assert.equal(js.statusCode, 200);
  assert.match(js.headers["cache-control"], /immutable/);
  const logo = await get("/logo.png");
  assert.equal(logo.statusCode, 200);
  assert.doesNotMatch(logo.headers["cache-control"] ?? "", /immutable/);
});

test("the API, health and MCP routes are unchanged", async () => {
  assert.deepEqual((await get("/health")).json(), { status: "ok" });
  const missing = await get("/api/nope");
  assert.equal(missing.statusCode, 404);
  assert.match(missing.headers["content-type"], /json/); // not a page
  assert.equal((await get("/api/")).statusCode, 404);
});

test("missing files and other methods are 404 JSON, not pages", async () => {
  assert.equal((await get("/assets/missing.js")).statusCode, 404);
  assert.equal((await get("/nothing.png")).statusCode, 404);
  const post = await app.inject({ method: "POST", url: "/studio" });
  assert.equal(post.statusCode, 404);
  assert.match(post.headers["content-type"], /json/);
});

test("paths that try to leave the site folder are refused", async () => {
  for (const url of ["/..%2f..%2fetc/passwd", "/../etc/passwd", "/studio/..%2f..%2fsecret", "/%2e%2e/%2e%2e/etc/passwd"]) {
    const res = await get(url);
    // Either refused, or (when the path is tidied up to an ordinary page) the site page: never a file from outside.
    assert.doesNotMatch(res.body, /root:/, url);
    if (res.statusCode === 200) assert.match(res.body, /<title>Site<\/title>/, url);
  }
});

test("pageFileFor tells pages from files and API routes", () => {
  assert.deepEqual(pageFileFor("/"), ["index.html"]);
  assert.deepEqual(pageFileFor("/studio/julia"), ["og/studio/julia.html", "index.html"]);
  assert.deepEqual(pageFileFor("/studio/"), ["og/studio.html", "index.html"]);
  for (const p of ["/api/chat", "/api", "/health", "/mcp", "/a.png", "/a b", "/a//b", "/%2e%2e/x"]) assert.equal(pageFileFor(p), null, p);
});

test("without a built client there are no pages (and the server still starts)", async () => {
  const empty = buildApp({ logger: false, corsOrigins: [], webRoot: path.join(dir, "nope") });
  await empty.ready();
  assert.equal((await empty.inject({ method: "GET", url: "/studio" })).statusCode, 404);
  assert.equal((await empty.inject({ method: "GET", url: "/tetris-loop.lottie" })).statusCode, 200);
  await empty.close();
});

test("a missing or broken asset list still gives a working page", async () => {
  await writeFile(path.join(dir, "boot-assets.json"), "not json");
  const res = await get("/");
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /__BOOT_ASSETS__/);
  assert.match(res.body, /src="\/boot\/index.js"/);
  await writeFile(path.join(dir, "boot-assets.json"), JSON.stringify(ASSETS));
});
