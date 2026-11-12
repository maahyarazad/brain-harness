// Building blocks for module instances.

/**
 * A static (non-animated) instance. draw(g, config, ctx, size) may return a
 * generator, which runs progressively and is cancelled on the next redraw.
 *
 * Updates from an animated sweep (update(c, keys, { sweep: true })) draw into an
 * off-screen canvas and copy the finished picture in one draw, so a sweep never
 * shows a blank or half-drawn frame. Other updates draw progressively on screen,
 * which gives quick feedback while dragging a slider.
 */
export function staticInstance(canvas, config, ctx, draw) {
  const g = canvas.getContext("2d");
  let cfg = config;
  let task = null;
  let off = null;
  function redraw({ offscreen = false } = {}) {
    task?.cancel();
    task = null;
    let target = g;
    if (offscreen) {
      off ??= document.createElement("canvas");
      if (off.width !== canvas.width || off.height !== canvas.height) {
        off.width = canvas.width;
        off.height = canvas.height;
      }
      target = off.getContext("2d");
    }
    const show = () => {
      if (target === g) return;
      g.drawImage(off, 0, 0);
    };
    const r = draw(target, cfg, ctx, { w: canvas.width, h: canvas.height });
    if (r && typeof r.next === "function") {
      const t = ctx.progressive(r);
      task = t;
      t.promise.then(
        () => {
          if (task !== t) return;
          task = null;
          show();
        },
        () => {}
      );
    } else {
      show();
    }
  }
  redraw();
  return {
    get config() {
      return cfg;
    },
    redraw,
    update(c, _changed, meta) {
      cfg = c;
      redraw({ offscreen: Boolean(meta?.sweep) });
    },
    /** True while a progressive drawing is still running. */
    isBusy: () => task !== null,
    resize() {
      redraw();
    },
    destroy() {
      task?.cancel();
      task = null;
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
