import { resampleByArcLength, dft, epicyclePoint } from "./kernel.js";
import { SHAPES, SHAPE_OPTIONS } from "./shapes.js";
import { BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

const SAMPLES = 512;

function validateInput(input) {
  const outline = Array.isArray(input?.outline)
    ? input.outline.filter((p) => Array.isArray(p) && p.every(Number.isFinite)).slice(0, SAMPLES)
    : [];
  return { value: outline.length >= 10 ? { outline } : null, replaced: [] };
}

export default {
  id: "fourier-epicycles",
  name: "Fourier epicycles",
  howItWorks:
    "Any closed outline can be rebuilt from circles, each spinning at a whole-number speed, with each circle riding on the edge of the one before. The biggest circles give the rough shape and smaller ones add the detail. Add circles and watch the drawing sharpen. Choose \"Your drawing\" and draw an outline on the canvas to have it redrawn.",
  animated: true,
  random: false,
  interactive: true,
  stepsPerFrame: 1,
  validateInput,
  knobs: [
    { key: "circles", label: "Circles", type: "range", min: 1, max: SAMPLES, step: 1, default: 40, scale: "log" },
    { key: "shape", label: "Outline", type: "choice", default: "heart", options: SHAPE_OPTIONS, live: false },
    { key: "showCircles", label: "Show circles", type: "toggle", default: true },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "rough", name: "Rough heart (5 circles)", values: { shape: "heart", circles: 5 } },
    { id: "sharp", name: "Sharp star (150 circles)", values: { shape: "star", circles: 150 } },
    { id: "square", name: "Square (20 circles)", values: { shape: "square", circles: 20 } },
  ],
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let coeffs = [], outline = [], path = [], step = 0;
    let recording = null;

    function init() {
      const raw = cfg.values.shape === "custom" ? cfg.input?.outline : SHAPES[cfg.values.shape]?.();
      if (!raw || raw.length < 3) {
        coeffs = [];
        outline = [];
      } else {
        outline = resampleByArcLength(raw, SAMPLES);
        coeffs = dft(outline);
      }
      path = [];
      step = 0;
    }

    function toScreen([x, y]) {
      const s = Math.min(canvas.width, canvas.height) * 0.42;
      return [canvas.width / 2 + x * s, canvas.height / 2 + y * s];
    }

    function render() {
      clear(g, BG);
      const pal = cfg.values.palette;
      if (recording) {
        g.strokeStyle = ctx.color(pal, 0.8);
        g.lineWidth = 2 * ctx.dpr;
        g.beginPath();
        recording.forEach((p, i) => (i ? g.lineTo(...toScreen(p)) : g.moveTo(...toScreen(p))));
        g.stroke();
        return;
      }
      if (!coeffs.length) {
        g.fillStyle = "#bbbbbb";
        g.font = `${14 * ctx.dpr}px system-ui, sans-serif`;
        g.textAlign = "center";
        g.fillText("Draw a closed outline here", canvas.width / 2, canvas.height / 2);
        return;
      }
      g.lineWidth = Math.max(1, ctx.dpr);
      g.strokeStyle = "rgba(255,255,255,0.12)";
      g.beginPath();
      outline.forEach((p, i) => (i ? g.lineTo(...toScreen(p)) : g.moveTo(...toScreen(p))));
      g.closePath();
      g.stroke();

      const k = Math.min(cfg.values.circles, coeffs.length);
      const t = (2 * Math.PI * step) / SAMPLES;
      if (cfg.values.showCircles) {
        let x = 0, y = 0;
        const s = Math.min(canvas.width, canvas.height) * 0.42;
        g.strokeStyle = "rgba(255,255,255,0.25)";
        for (let i = 0; i < k; i++) {
          const c = coeffs[i];
          const [cx, cy] = toScreen([x, y]);
          if (c.amp * s > 0.5) {
            g.beginPath();
            g.arc(cx, cy, c.amp * s, 0, 2 * Math.PI);
            g.stroke();
          }
          x += c.amp * Math.cos(c.freq * t + c.phase);
          y += c.amp * Math.sin(c.freq * t + c.phase);
        }
      }
      g.strokeStyle = ctx.color(pal, 0.85);
      g.lineWidth = 2 * ctx.dpr;
      g.beginPath();
      path.forEach((p, i) => (i ? g.lineTo(...toScreen(p)) : g.moveTo(...toScreen(p))));
      g.stroke();
      ctx.reportStats({ circles: k });
    }

    init();
    render();
    return {
      update(c, changed = []) {
        const reinit = changed.includes("shape") || c.input !== cfg.input;
        cfg = c;
        if (reinit) init();
        if (changed.includes("circles")) {
          path = [];
          step = 0;
        }
        render();
      },
      step() {
        if (!coeffs.length) return;
        const t = (2 * Math.PI * step) / SAMPLES;
        path.push(epicyclePoint(coeffs, cfg.values.circles, t));
        step++;
        if (step > SAMPLES) {
          step = 0;
          path = [];
        }
      },
      render,
      reset() {
        init();
        render();
      },
      resize: render,
      destroy() {},
      pointer(ev) {
        if (cfg.values.shape !== "custom") return;
        const s = Math.min(canvas.width, canvas.height) * 0.42;
        const p = [(ev.x - canvas.width / 2) / s, (ev.y - canvas.height / 2) / s];
        if (ev.type === "down" && ev.button === 0) {
          recording = [p];
          render();
        } else if (ev.type === "move" && recording) {
          recording.push(p);
          render();
        } else if (ev.type === "up" && recording) {
          const pts = recording;
          recording = null;
          if (pts.length >= 10) {
            const sampled = resampleByArcLength(pts, Math.min(SAMPLES, pts.length));
            const input = { outline: sampled.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]) };
            cfg = { ...cfg, input };
            ctx.setInput(input);
            init();
          } else {
            ctx.reportNotice("Draw a longer outline (hold the button and drag).");
          }
          render();
        }
      },
    };
  },
};
