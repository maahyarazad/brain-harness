import { Delaunay } from "d3-delaunay";
import { randomPoints, lloydStep, manhattanRaster, manhattanLloyd } from "./kernel.js";
import { staticInstance, gridImage, BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";
import { createRng } from "../../core/rng.js";

const MAX_POINTS = 2000;
const MAX_MANHATTAN = 500;

function validateInput(input) {
  const pts = Array.isArray(input?.points)
    ? input.points
        .filter((p) => Array.isArray(p) && p.every((v) => Number.isFinite(v)))
        .map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))])
        .slice(0, MAX_POINTS)
    : [];
  return { value: pts.length ? { points: pts } : null, replaced: [] };
}

function hashColor(i) {
  return ((i * 2654435761) >>> 0) / 4294967296;
}

export default {
  id: "voronoi",
  name: "Voronoi and Delaunay",
  howItWorks:
    "Scatter seed points. Each Voronoi cell is the area closer to its seed than to any other, which splits the plane into a stained-glass pattern. Joining seeds whose cells touch gives the Delaunay triangulation. With the Manhattan metric (distance along streets on a grid), cell walls turn into straight and diagonal lines. Relaxation moves each seed to the middle of its cell, making cells more even. Click to add points, drag to move them, right-click to remove.",
  animated: false,
  random: true,
  interactive: true,
  validateInput,
  knobs: [
    { key: "count", label: "Points", type: "range", min: 3, max: MAX_POINTS, step: 1, default: 120, scale: "log", live: false },
    {
      key: "metric", label: "Distance", type: "choice", default: "euclidean",
      options: [{ value: "euclidean", label: "Euclidean (straight line)" }, { value: "manhattan", label: "Manhattan (grid streets)" }],
    },
    { key: "relax", label: "Relaxation steps", type: "range", min: 0, max: 50, step: 1, default: 0 },
    {
      key: "show", label: "Show", type: "choice", default: "cells",
      options: [{ value: "cells", label: "Cells" }, { value: "triangulation", label: "Triangulation" }, { value: "both", label: "Both" }],
    },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "glass", name: "Stained glass", values: { count: 120, relax: 0, show: "cells" } },
    { id: "honeycomb", name: "Relaxed (honeycomb)", values: { count: 200, relax: 30, show: "cells" } },
    { id: "mesh", name: "Triangle mesh", values: { count: 300, relax: 5, show: "triangulation" } },
    { id: "city", name: "Manhattan city", values: { count: 60, metric: "manhattan", relax: 2 } },
  ],
  create(canvas, config, ctx) {
    let base = [];
    let shown = [];
    let drag = null;

    function basePoints(cfg) {
      if (cfg.input?.points) return cfg.input.points.map((p) => [...p]);
      return randomPoints(cfg.values.count, createRng(cfg.seed));
    }

    const inst = staticInstance(canvas, config, ctx, function* (g, cfg, _ctx, { w, h }) {
      const { metric, relax, show, palette } = cfg.values;
      if (!drag) base = basePoints(cfg);
      let pts = base;
      if (metric === "manhattan" && pts.length > MAX_MANHATTAN) {
        ctx.reportNotice(`Manhattan distance uses the first ${MAX_MANHATTAN} points, to keep drawing fast.`);
        pts = pts.slice(0, MAX_MANHATTAN);
      }
      clear(g, BG);
      if (metric === "euclidean") {
        for (let i = 0; i < relax; i++) pts = lloydStep(pts);
        shown = pts;
        const scaled = pts.map(([x, y]) => [x * w, y * h]);
        const del = Delaunay.from(scaled);
        if (show !== "triangulation") {
          const vor = del.voronoi([0, 0, w, h]);
          for (let i = 0; i < scaled.length; i++) {
            g.fillStyle = ctx.color(palette, 0.15 + 0.85 * hashColor(i));
            g.beginPath();
            vor.renderCell(i, g);
            g.fill();
          }
          g.strokeStyle = "rgba(10,10,14,0.9)";
          g.lineWidth = Math.max(1, ctx.dpr);
          g.beginPath();
          vor.render(g);
          g.stroke();
        }
        if (show !== "cells") {
          g.strokeStyle = show === "both" ? "rgba(255,255,255,0.75)" : ctx.color(palette, 0.8);
          g.lineWidth = Math.max(1, ctx.dpr * 0.75);
          g.beginPath();
          del.render(g);
          g.stroke();
        }
      } else {
        const scale = 2;
        const rw = Math.max(1, Math.floor(w / scale)), rh = Math.max(1, Math.floor(h / scale));
        let raster = manhattanRaster(pts, rw, rh);
        yield 0.3;
        for (let i = 0; i < relax; i++) {
          pts = manhattanLloyd(pts, raster, rw, rh);
          raster = manhattanRaster(pts, rw, rh);
          yield 0.3 + (0.6 * (i + 1)) / Math.max(1, relax);
        }
        shown = pts;
        const img = gridImage(rw, rh);
        const lut = ctx.palette(palette);
        const d = img.data;
        for (let i = 0; i < raster.length; i++) {
          const k = raster[i];
          const x = i % rw, y = Math.floor(i / rw);
          const edge = (x + 1 < rw && raster[i + 1] !== k) || (y + 1 < rh && raster[i + rw] !== k);
          const c = Math.round((0.15 + 0.85 * hashColor(k)) * 255) * 3;
          d[i * 4] = edge ? 10 : lut[c];
          d[i * 4 + 1] = edge ? 10 : lut[c + 1];
          d[i * 4 + 2] = edge ? 14 : lut[c + 2];
          d[i * 4 + 3] = 255;
        }
        img.blit(g, 0, 0, w, h);
        if (show !== "cells") {
          const del = Delaunay.from(pts.map(([x, y]) => [x * w, y * h]));
          g.strokeStyle = "rgba(255,255,255,0.75)";
          g.lineWidth = Math.max(1, ctx.dpr * 0.75);
          g.beginPath();
          del.render(g);
          g.stroke();
        }
      }
      g.fillStyle = "#ffffff";
      const r = Math.max(1.5, 2 * ctx.dpr);
      for (const [x, y] of shown) {
        g.beginPath();
        g.arc(x * w, y * h, r, 0, 2 * Math.PI);
        g.fill();
      }
      ctx.reportStats({ points: base.length });
    });

    function commit() {
      const input = { points: base.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]) };
      ctx.setInput(input);
      return input;
    }

    let cfgWithInput = config;
    return {
      update(c) {
        cfgWithInput = c;
        inst.update(c);
      },
      resize: inst.resize,
      destroy: inst.destroy,
      pointer(ev) {
        const { width: w, height: h } = canvas;
        const nx = ev.x / w, ny = ev.y / h;
        const nearest = () => {
          let best = -1, bd = (12 * ctx.dpr) ** 2;
          shown.forEach(([x, y], i) => {
            const d = (x * w - ev.x) ** 2 + (y * h - ev.y) ** 2;
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          return best;
        };
        if (ev.type === "down") {
          const i = nearest();
          if (ev.button === 2) {
            if (i >= 0 && base.length > 3) {
              base.splice(i, 1);
              const input = commit();
              inst.update({ ...cfgWithInput, input });
            }
            return;
          }
          if (i >= 0) drag = { i };
          else if (base.length < MAX_POINTS) {
            base.push([nx, ny]);
            drag = { i: base.length - 1 };
            const input = commit();
            cfgWithInput = { ...cfgWithInput, input };
            drag.cfg = cfgWithInput;
            inst.redraw();
          }
        } else if (ev.type === "move" && drag) {
          base[drag.i] = [Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, ny))];
          inst.redraw();
        } else if (ev.type === "up" && drag) {
          drag = null;
          const input = commit();
          cfgWithInput = { ...cfgWithInput, input };
          inst.update(cfgWithInput);
        }
      },
    };
  },
};
