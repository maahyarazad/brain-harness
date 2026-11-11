// Shared renderer and interaction for the Mandelbrot and Julia modules.
import { escapeBand } from "./kernel.js";
import { registerKernel } from "../../core/workerPool.js";
import { BG_RGB } from "../_shared/instance.js";

registerKernel("escapeBand", escapeBand);

export const MAX_ZOOM = 1e13;
const BAND = 16;

export function validateView(view, defaults) {
  const replaced = [];
  const out = { ...defaults };
  for (const k of ["cx", "cy", "zoom"]) {
    if (typeof view?.[k] === "number" && Number.isFinite(view[k])) out[k] = view[k];
    else if (view && k in view) replaced.push({ key: `view.${k}`, given: view[k], used: defaults[k] });
  }
  if (out.zoom < 0.5) out.zoom = 0.5;
  if (out.zoom > MAX_ZOOM) out.zoom = MAX_ZOOM;
  return { value: out, replaced };
}

/** Creates an escape-time instance. getC(values) returns null (Mandelbrot) or [re, im] (Julia). */
export function createEscapeInstance(canvas, config, ctx, { getC, span = 3, onShiftClick }) {
  const g = canvas.getContext("2d");
  let cfg = config;
  let view = { ...config.view };
  let tasks = [];
  let drag = null;

  function cancelAll() {
    tasks.forEach((t) => t.cancel());
    tasks = [];
  }

  function geometry() {
    const { width: w, height: h } = canvas;
    const dx = span / view.zoom / Math.min(w, h);
    return { w, h, dx, x0: view.cx - (w / 2) * dx, y0: view.cy + (h / 2) * dx };
  }

  function paint(band, w) {
    const { iterations, palette, smooth } = cfg.values;
    const lut = ctx.palette(palette);
    const rows = band.rowEnd - band.rowStart;
    const img = g.createImageData(w, rows);
    const d = img.data;
    const logMax = Math.log(iterations + 1);
    for (let i = 0; i < band.counts.length; i++) {
      const v = band.counts[i];
      const p = i * 4;
      if (v < 0) {
        d[p] = BG_RGB[0]; d[p + 1] = BG_RGB[1]; d[p + 2] = BG_RGB[2];
      } else {
        let t = smooth ? Math.log(v + 1) / logMax : v / iterations;
        t = Math.sqrt(Math.min(1, t));
        const k = Math.round(t * 255) * 3;
        d[p] = lut[k]; d[p + 1] = lut[k + 1]; d[p + 2] = lut[k + 2];
      }
      d[p + 3] = 255;
    }
    g.putImageData(img, 0, band.rowStart);
  }

  function render() {
    cancelAll();
    const { w, h, dx, x0, y0 } = geometry();
    const { iterations, smooth } = cfg.values;
    const juliaC = getC(cfg.values);
    let done = 0;
    const total = Math.ceil(h / BAND);
    for (let rowStart = 0; rowStart < h; rowStart += BAND) {
      const t = ctx.runKernel("escapeBand", {
        x0, y0, dx, width: w, rowStart, rowEnd: Math.min(h, rowStart + BAND),
        maxIter: iterations, smooth, juliaC,
      });
      t.promise.then(
        (band) => {
          paint(band, w);
          done++;
          ctx.reportProgress(done / total);
        },
        () => {}
      );
      tasks.push(t);
    }
    ctx.reportStats({ zoom: `${view.zoom.toPrecision(3)}×` });
  }

  function setView(v, { silent = false } = {}) {
    view = v;
    if (view.zoom >= MAX_ZOOM) {
      view.zoom = MAX_ZOOM;
      ctx.reportNotice("Zoom limit reached: past this point the numbers lose precision.");
    }
    if (!silent) ctx.setView({ ...view });
  }

  function zoomAt(px, py, factor) {
    const { w, h, dx } = geometry();
    const wx = view.cx + (px - w / 2) * dx;
    const wy = view.cy - (py - h / 2) * dx;
    const zoom = Math.max(0.5, Math.min(MAX_ZOOM, view.zoom * factor));
    const ndx = span / zoom / Math.min(w, h);
    setView({ cx: wx - (px - w / 2) * ndx, cy: wy + (py - h / 2) * ndx, zoom });
    render();
  }

  render();

  return {
    update(c) {
      cfg = c;
      if (c.view) view = { ...c.view };
      render();
    },
    resize: render,
    destroy: cancelAll,
    pointer(ev) {
      const { dx } = geometry();
      if (ev.type === "down" && ev.button === 0) {
        if (ev.shiftKey && onShiftClick) {
          const { w, h } = geometry();
          onShiftClick(view.cx + (ev.x - w / 2) * dx, view.cy - (ev.y - h / 2) * dx);
          return;
        }
        drag = { x: ev.x, y: ev.y, cx: view.cx, cy: view.cy, moved: false };
      } else if (ev.type === "move" && drag) {
        const ddx = ev.x - drag.x, ddy = ev.y - drag.y;
        if (Math.abs(ddx) + Math.abs(ddy) > 2) drag.moved = true;
        // Cheap preview: shift the existing pixels; full render on release.
        g.drawImage(canvas, ddx - (drag.lastDx ?? 0), ddy - (drag.lastDy ?? 0));
        drag.lastDx = ddx;
        drag.lastDy = ddy;
      } else if (ev.type === "up" && drag) {
        if (drag.moved) {
          setView({ cx: drag.cx - (ev.x - drag.x) * dx, cy: drag.cy + (ev.y - drag.y) * dx, zoom: view.zoom });
          render();
        }
        drag = null;
      } else if (ev.type === "dblclick") {
        zoomAt(ev.x, ev.y, 2);
      } else if (ev.type === "wheel") {
        zoomAt(ev.x, ev.y, Math.exp(-ev.deltaY * 0.0015));
      } else if (ev.type === "key") {
        const { w, h } = geometry();
        const step = 0.1 * Math.min(w, h) * dx;
        const k = ev.key;
        if (k === "+" || k === "=") zoomAt(w / 2, h / 2, 1.5);
        else if (k === "-" || k === "_") zoomAt(w / 2, h / 2, 1 / 1.5);
        else if (k.startsWith("Arrow")) {
          const v = { ...view };
          if (k === "ArrowLeft") v.cx -= step;
          if (k === "ArrowRight") v.cx += step;
          if (k === "ArrowUp") v.cy += step;
          if (k === "ArrowDown") v.cy -= step;
          setView(v);
          render();
        } else return false;
        return true;
      }
    },
  };
}
