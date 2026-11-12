import { circlePoint } from "./kernel.js";
import { BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

export default {
  id: "times-table",
  name: "Times-table circle",
  howItWorks:
    "Put N points evenly around a circle and number them 0 to N−1. Connect each point k to point k × m, wrapping around past N. With m = 2 the lines outline a cardioid, with m = 3 a nephroid, and other values give flowers. Turn on \"Animate m\" to watch the shapes morph into each other.",
  animated: true,
  random: false,
  interactive: false,
  knobs: [
    { key: "m", label: "Multiplier m", type: "range", min: 0, max: 100, step: 0.01, default: 2 },
    { key: "N", label: "Points N", type: "range", min: 10, max: 1000, step: 1, default: 200 },
    { key: "animate", label: "Animate m", type: "toggle", default: false },
    { key: "rate", label: "Animation rate", type: "range", min: 0.001, max: 0.5, step: 0.001, default: 0.01, when: (v) => v.animate },
    { key: "opacity", label: "Line opacity", type: "range", min: 0.05, max: 1, step: 0.05, default: 0.6 },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "cardioid", name: "Cardioid (m = 2)", values: { m: 2 } },
    { id: "nephroid", name: "Nephroid (m = 3)", values: { m: 3 } },
    { id: "flower", name: "Flower (m = 34)", values: { m: 34, N: 300, opacity: 0.4 } },
    { id: "sweep", name: "Animated sweep", values: { m: 2, animate: true, rate: 0.005 } },
  ],
  // The catalog card's sample picture (contracts/thumbnail.md).
  thumbnail: { values: { m: 2, N: 300 } },
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let m = cfg.values.m;

    function render() {
      const { N, opacity, palette } = cfg.values;
      const { width: w, height: h } = canvas;
      clear(g, BG);
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.45;
      g.lineWidth = Math.max(0.5, ctx.dpr * 0.75);
      g.globalAlpha = opacity;
      for (let k = 0; k < N; k++) {
        const [x1, y1] = circlePoint(k, N, cx, cy, r);
        const [x2, y2] = circlePoint((k * m) % N, N, cx, cy, r);
        g.strokeStyle = ctx.color(palette, k / N);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
      g.globalAlpha = 1;
      ctx.reportStats({ m: m.toFixed(2) });
    }

    render();
    return {
      update(c) {
        if (c.values.m !== cfg.values.m) m = c.values.m;
        cfg = c;
        render();
      },
      step() {
        if (cfg.values.animate) m = (m + cfg.values.rate) % 100;
      },
      render,
      reset() {
        m = cfg.values.m;
        render();
      },
      resize: render,
      destroy() {},
    };
  },
};
