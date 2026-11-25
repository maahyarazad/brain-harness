// A palette lookup (ctx.palette(name): 256 RGB triples) as a 256 x 1 texture a shader can sample.

export function createPalettes(targets) {
  const cache = new WeakMap(); // lookup table → texture, so the same palette is uploaded once

  return function paletteTexture(lut) {
    const hit = cache.get(lut);
    if (hit) return hit;
    const rgba = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      rgba[i * 4] = lut[i * 3];
      rgba[i * 4 + 1] = lut[i * 3 + 1];
      rgba[i * 4 + 2] = lut[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    // keepData: after a context restore the palette is uploaded again with no help from the module.
    const tex = targets.target({ w: 256, h: 1, format: "rgba8", filter: "linear", data: rgba, keepData: true });
    cache.set(lut, tex);
    return tex;
  };
}
