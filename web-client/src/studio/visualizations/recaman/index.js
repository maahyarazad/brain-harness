import { recaman } from "./kernel.js";
import { BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

export default {
  id: "recaman",
  name: "Recamán's sequence",
  howItWorks:
    "Start at 0. On step n, go back n if that lands on a positive number you haven't visited; otherwise go forward n. Each jump is drawn as an arc between the two numbers, alternating above and below the line, which gives the look of nested rainbows.",
  animated: true,
  random: false,
  interactive: false,
  stepsPerFrame: 0.5,
  knobs: [
    { key: "terms", label: "Number of terms", type: "range", min: 2, max: 2000, step: 1, default: 80, scale: "log" },
    {
      key: "arcStyle", label: "Arc style", type: "choice", default: "alternating",
      options: [
        { value: "alternating", label: "Alternating above/below" },
        { value: "semicircle", label: "All above" },
        { value: "ellipse", label: "Flattened ellipses" },
      ],
    },
    { key: "lineWidth", label: "Line width", type: "range", min: 0.5, max: 4, step: 0.5, default: 1.5 },
    paletteKnob("palette", "twilight"),
  ],
  presets: [
    { id: "classic", name: "Classic 80 terms", values: { terms: 80 } },
    { id: "dense", name: "Dense 600", values: { terms: 600, lineWidth: 0.5, palette: "viridis" } },
  ],
  sweep: { periodMs: 30000, targets: [{ key: "terms", mode: "log", min: 20, max: 600 }] },
  // The catalog card's sample picture (contracts/thumbnail.md).
  thumbnail: { values: { terms: 120 }, steps: 240 },
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let seq = recaman(cfg.values.terms);
    let shown = 1;

    function render() {
      const { arcStyle, lineWidth, palette } = cfg.values;
      const { width: w, height: h } = canvas;
      clear(g, BG);
      let max = 1;
      for (let i = 0; i < shown; i++) if (seq[i] > max) max = seq[i];
      const sx = (w * 0.96) / max;
      const ox = w * 0.02;
      const mid = h / 2;
      const flat = arcStyle === "ellipse" ? 0.5 : 1;
      g.lineWidth = lineWidth * ctx.dpr;
      for (let n = 1; n < shown; n++) {
        const a = seq[n - 1], b = seq[n];
        const cx = ox + ((a + b) / 2) * sx;
        const r = (Math.abs(b - a) / 2) * sx;
        const above = arcStyle === "semicircle" ? true : n % 2 === 1;
        g.strokeStyle = ctx.color(palette, n / seq.length);
        g.beginPath();
        if (above) g.ellipse(cx, mid, r, r * flat, 0, Math.PI, 2 * Math.PI);
        else g.ellipse(cx, mid, r, r * flat, 0, 0, Math.PI);
        g.stroke();
      }
    }

    render();
    return {
      update(c) {
        if (c.values.terms !== cfg.values.terms) {
          seq = recaman(c.values.terms);
          shown = Math.min(shown, seq.length);
        }
        cfg = c;
        render();
      },
      step() {
        if (shown < seq.length) shown++;
      },
      render,
      reset() {
        shown = 1;
        render();
      },
      resize: render,
      destroy() {},
    };
  },
};
