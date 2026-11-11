// Building blocks for module instances.

/**
 * A static (non-animated) instance. draw(g, config, ctx, size) may return a
 * generator, which runs progressively and is cancelled on the next redraw.
 */
export function staticInstance(canvas, config, ctx, draw) {
  const g = canvas.getContext("2d");
  let cfg = config;
  let task = null;
  function redraw() {
    task?.cancel();
    task = null;
    const r = draw(g, cfg, ctx, { w: canvas.width, h: canvas.height });
    if (r && typeof r.next === "function") task = ctx.progressive(r);
  }
  redraw();
  return {
    get config() {
      return cfg;
    },
    redraw,
    update(c) {
      cfg = c;
      redraw();
    },
    resize() {
      redraw();
    },
    destroy() {
      task?.cancel();
    },
  };
}

/** Offscreen grid image: write pixels into `data`, then blit scaled onto the canvas. */
export function gridImage(cols, rows) {
  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  const og = off.getContext("2d");
  const img = og.createImageData(cols, rows);
  return {
    cols,
    rows,
    data: img.data,
    blit(g, x = 0, y = 0, w = g.canvas.width, h = g.canvas.height) {
      og.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(off, x, y, w, h);
    },
  };
}

/** Largest w×h box with the given aspect that fits the canvas, centered. */
export function fitAspect(cw, ch, aspect) {
  let w = cw;
  let h = cw / aspect;
  if (h > ch) {
    h = ch;
    w = ch * aspect;
  }
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

export const BG = "#0f0f12";
export const BG_RGB = [15, 15, 18];
