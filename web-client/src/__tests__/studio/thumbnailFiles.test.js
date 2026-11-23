// @vitest-environment node
// The catalog pictures in public/thumbs (specs/004-studio-home-sweep/contracts/thumbnail.md).
// If this fails after adding or changing a visualization: npm run dev → /studio/__thumbnails → Save.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CATALOG } from "../../studio/catalog.js";

const DIR = fileURLToPath(new URL("../../../public/thumbs/", import.meta.url));
const files = readdirSync(DIR);

/** Width and height from a WebP file's VP8 / VP8L / VP8X chunk. */
function webpSize(b) {
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (chunk === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  return null;
}

test.each(CATALOG.map((e) => [e.id]))("%s has a 320×240 WebP picture of at most 30 KB", (id) => {
  const name = `${id}.webp`;
  expect(files).toContain(name);
  const b = readFileSync(DIR + name);
  expect(b.toString("latin1", 0, 4)).toBe("RIFF");
  expect(b.toString("latin1", 8, 12)).toBe("WEBP");
  expect(webpSize(b)).toEqual([320, 240]);
  expect(b.length).toBeLessThanOrEqual(30 * 1024);
});

test("all pictures together are at most 500 KB, with none left over", () => {
  const ids = new Set(CATALOG.map((e) => `${e.id}.webp`));
  expect(files.filter((f) => !ids.has(f))).toEqual([]);
  const total = files.reduce((n, f) => n + statSync(DIR + f).size, 0);
  expect(total).toBeLessThanOrEqual(500 * 1024);
});
