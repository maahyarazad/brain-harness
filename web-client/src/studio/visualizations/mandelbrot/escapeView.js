// Shared renderer and interaction for the Mandelbrot and Julia modules.
//
// The canvas never shows two views at once (FR-030, research.md R14):
// 1. Every view change draws the most recent finished picture, scaled and
//    shifted to the new view, in one drawImage call.
// 2. A quarter-resolution pass computes the whole view and replaces it in one call.
// 3. Once the view has been still for SETTLE_MS, a full-resolution pass is
//    assembled off-screen and swapped in with one call.
import { escapeBand } from "./kernel.js";
import { registerKernel, poolSize } from "../../core/workerPool.js";
import { BG, BG_RGB } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";

registerKernel("escapeBand", escapeBand);

export const MAX_ZOOM = 1e13;
export const SETTLE_MS = 150;
export const PREVIEW_FACTOR = 4;

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

function makeBuffer(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Creates an escape-time instance. getC(values) returns null (Mandelbrot) or [re, im] (Julia). */
export function createEscapeInstance(canvas, config, ctx, { getC, span = 3, onShiftClick }) {
  const g = canvas.getContext("2d");
  let cfg = config;
  let view = { ...config.view };
  let drag = null;
  let atLimit = view.zoom >= MAX_ZOOM;
  let destroyed = false;

  // Every change of view or settings bumps the version. A pass remembers the
  // version and geometry it was computed for.
  let version = 0;
  // The picture currently used as the source for the screen:
  // { buf, x0, y0, dx, version, full } (x0/y0: world coords of its top-left pixel).
  let best = null;
  const lowBuf = makeBuffer(1, 1);
  const fullBuf = makeBuffer(1, 1);

  let previewTasks = null; // running quarter-resolution pass
  let previewWanted = false; // view changed while it ran
  let fullTasks = null; // running full-resolution pass
  let frame = null;
  let settleTimer = null;

  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
  const caf = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout;

  function geometry() {
    const { width: w, height: h } = canvas;
    const dx = span / view.zoom / Math.min(w, h);
    return { w, h, dx, x0: view.cx - (w / 2) * dx, y0: view.cy + (h / 2) * dx };
  }

  // --- Drawing ---

  /** Draws the best finished picture mapped onto the current view, in one call. */
  function drawPreview() {
    clear(g, BG);
    if (!best) return;
    const cur = geometry();
    const s = best.dx / cur.dx;
    const left = (best.x0 - cur.x0) / cur.dx;
    const top = (cur.y0 - best.y0) / cur.dx;
    const { width: bw, height: bh } = best.buf;
    if (s === 1 && left === 0 && top === 0) {
      g.drawImage(best.buf, 0, 0);
      return;
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(best.buf, 0, 0, bw, bh, left, top, bw * s, bh * s);
  }

  function colorize(counts, img, offset) {
    const { iterations, palette, smooth } = cfg.values;
    const lut = ctx.palette(palette);
    const d = img.data;
    const logMax = Math.log(iterations + 1);
    for (let i = 0; i < counts.length; i++) {
      const v = counts[i];
      const p = (offset + i) * 4;
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
  }

  // --- Passes ---

  /**
   * Computes the whole current view at 1/factor resolution, split into one row
   * chunk per worker. Resolves with a picture record, or rejects if cancelled.
   */
  function runPass(factor, onChunk) {
    const cur = geometry();
    const pw = Math.ceil(cur.w / factor);
    const ph = Math.ceil(cur.h / factor);
    const dx = cur.dx * factor;
    const { iterations, smooth } = cfg.values;
    const juliaC = getC(cfg.values);
    const chunks = Math.max(1, Math.min(poolSize(), ph));
    const rowsPer = Math.ceil(ph / chunks);
    const img = g.createImageData(pw, ph);
    const tasks = [];
    for (let rowStart = 0; rowStart < ph; rowStart += rowsPer) {
      const t = ctx.runKernel("escapeBand", {
        x0: cur.x0, y0: cur.y0, dx, width: pw, rowStart, rowEnd: Math.min(ph, rowStart + rowsPer),
        maxIter: iterations, smooth, juliaC,
      });
      tasks.push(t);
    }
    let done = 0;
    const promise = Promise.all(
      tasks.map((t) =>
        t.promise.then((band) => {
          colorize(band.counts, img, band.rowStart * pw);
          done++;
          onChunk?.(done / tasks.length);
        })
      )
    ).then(() => ({ img, x0: cur.x0, y0: cur.y0, dx, pw, ph }));
    promise.catch(() => {});
    return { tasks, promise, cancel: () => tasks.forEach((t) => t.cancel()) };
  }

  /** Makes `pic` (computed for version v) the screen source if nothing newer is shown. */
  function accept(pic, v, full) {
    if (best && (v < best.version || (v === best.version && best.full && !full))) return false;
    const buf = full ? fullBuf : lowBuf;
    if (buf.width !== pic.pw || buf.height !== pic.ph) {
      buf.width = pic.pw;
      buf.height = pic.ph;
    }
    buf.getContext("2d").putImageData(pic.img, 0, 0);
    best = { buf, x0: pic.x0, y0: pic.y0, dx: pic.dx, version: v, full };
    return true;
  }

  function startPreview(then) {
    if (previewTasks) {
      previewWanted = true;
      return;
    }
    previewWanted = false;
    const v = version;
    const pass = runPass(PREVIEW_FACTOR);
    previewTasks = pass;
    pass.promise.then(
      (pic) => {
        previewTasks = null;
        if (destroyed) return;
        if (accept(pic, v, false)) drawPreview();
        if (previewWanted) schedulePreview();
        else if (then && v === version) then();
      },
      () => {
        previewTasks = null;
      }
    );
  }

  function startFull() {
    cancelFull();
    const v = version;
    const pass = runPass(1, (p) => p < 1 && ctx.reportProgress(p));
    fullTasks = pass;
    pass.promise.then(
      (pic) => {
        if (fullTasks !== pass) return;
        fullTasks = null;
        if (destroyed || v !== version) return;
        if (accept(pic, v, true)) drawPreview();
        ctx.reportProgress(1);
      },
      () => {}
    );
  }

  function cancelFull() {
    if (fullTasks) fullTasks.cancel();
    fullTasks = null;
    clearTimeout(settleTimer);
    settleTimer = null;
  }

  function schedulePreview() {
    if (frame !== null) return;
    frame = raf(() => {
      frame = null;
      if (!destroyed) startPreview();
    });
  }

  function reportZoom() {
    ctx.reportStats({ zoom: `${view.zoom.toPrecision(3)}×` });
  }

  /** A view change from a continuous input (pinch, wheel, drag, keys, buttons). */
  function viewChanged() {
    version++;
    cancelFull();
    drawPreview();
    reportZoom();
    schedulePreview();
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (!destroyed) startFull();
    }, SETTLE_MS);
  }

  /** A one-off change (create, double-click, settings, resize): both passes now. */
  function renderNow() {
    version++;
    cancelFull();
    if (frame !== null) caf(frame);
    frame = null;
    drawPreview();
    reportZoom();
    if (previewTasks) {
      // Let the running preview finish (it is short); then preview + full for this version.
      previewWanted = false;
      const v = version;
      previewTasks.promise.then(
        () => v === version && !destroyed && startPreview(startFull),
        () => v === version && !destroyed && startPreview(startFull)
      );
      return;
    }
    startPreview(startFull);
  }

  // --- View changes ---

  function setView(v, { silent = false } = {}) {
    view = v;
    if (view.zoom >= MAX_ZOOM) {
      view.zoom = MAX_ZOOM;
      if (!atLimit) ctx.reportNotice("Zoom limit reached: past this point the numbers lose precision.");
      atLimit = true;
    } else {
      atLimit = false;
    }
    if (!silent) ctx.setView({ ...view });
  }

  function zoomAt(px, py, factor, { now = false } = {}) {
    const { w, h, dx } = geometry();
    const wx = view.cx + (px - w / 2) * dx;
    const wy = view.cy - (py - h / 2) * dx;
    const zoom = Math.max(0.5, Math.min(MAX_ZOOM, view.zoom * factor));
    const ndx = span / zoom / Math.min(w, h);
    setView({ cx: wx - (px - w / 2) * ndx, cy: wy + (py - h / 2) * ndx, zoom });
    if (now) renderNow();
    else viewChanged();
  }

  function dragView(ev) {
    const { dx } = geometry();
    return { cx: drag.cx - (ev.x - drag.x) * dx, cy: drag.cy + (ev.y - drag.y) * dx, zoom: view.zoom };
  }

  function finishDrag(ev) {
    if (drag.moved) {
      setView(dragView(ev));
      viewChanged();
    }
    drag = null;
  }

  renderNow();

  return {
    update(c) {
      cfg = c;
      if (c.view) {
        view = { ...c.view };
        atLimit = view.zoom >= MAX_ZOOM;
      }
      // The old picture stays on screen until the new settings' preview replaces it.
      renderNow();
    },
    resize: renderNow,
    destroy() {
      destroyed = true;
      cancelFull();
      if (frame !== null) caf(frame);
      frame = null;
      previewTasks?.cancel();
      previewTasks = null;
    },
    pointer(ev) {
      const { dx } = geometry();
      if (ev.type === "down" && ev.button === 0) {
        if (ev.shiftKey && onShiftClick) {
          const { w, h } = geometry();
          onShiftClick(view.cx + (ev.x - w / 2) * dx, view.cy - (ev.y - h / 2) * dx);
          return;
        }
        if (drag) {
          // A second pointer: this is the start of a pinch, not a drag.
          drag = null;
          return;
        }
        drag = { x: ev.x, y: ev.y, cx: view.cx, cy: view.cy, moved: false };
      } else if (ev.type === "move" && drag) {
        if (Math.abs(ev.x - drag.x) + Math.abs(ev.y - drag.y) > 2) drag.moved = true;
        if (!drag.moved) return;
        // Follow the pointer live; the view is reported to the shell on release.
        setView(dragView(ev), { silent: true });
        viewChanged();
      } else if (ev.type === "up" && drag) {
        if (ev.cancelDrag) {
          // A second finger went down: put the view back where the drag started.
          if (drag.moved) {
            setView({ cx: drag.cx, cy: drag.cy, zoom: view.zoom }, { silent: true });
            viewChanged();
          }
          drag = null;
        } else finishDrag(ev);
      } else if (ev.type === "leave" && drag) {
        finishDrag(ev);
      } else if (ev.type === "dblclick") {
        zoomAt(ev.x, ev.y, 2, { now: true });
      } else if (ev.type === "pinch") {
        if (Number.isFinite(ev.scale) && ev.scale > 0) zoomAt(ev.x, ev.y, ev.scale);
      } else if (ev.type === "wheel") {
        // Trackpad pinch arrives as ctrl + wheel with small deltas: zoom faster.
        const rate = ev.ctrlKey ? 0.02 : 0.0015;
        zoomAt(ev.x, ev.y, Math.exp(-ev.deltaY * rate));
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
          viewChanged();
        } else return false;
        return true;
      }
    },
  };
}
