import { createEscapeInstance, validateView } from "./escapeView.js";
import { paletteKnob } from "../../core/palettes.js";

const DEFAULT_VIEW = { cx: -0.6, cy: 0, zoom: 1 };

export default {
  id: "mandelbrot",
  name: "Mandelbrot set",
  howItWorks:
    "For each point c of the plane, start at z = 0 and repeat z → z² + c. If z stays small forever, c is in the set (drawn dark). Otherwise the point is colored by how quickly z escapes. Drag to pan; scroll, pinch, double-click or use the + / − buttons to zoom (⟲ resets the view); the + / − and arrow keys work from the keyboard; and Shift+click a point to open the Julia set for that c.",
  animated: false,
  random: false,
  interactive: true,
  defaultView: DEFAULT_VIEW,
  validateView: (v) => validateView(v, DEFAULT_VIEW),
  knobs: [
    { key: "iterations", label: "Iteration limit", type: "range", min: 50, max: 5000, step: 1, default: 300, scale: "log", live: false },
    paletteKnob("palette", "twilight"),
    { key: "smooth", label: "Smooth coloring", type: "toggle", default: true },
  ],
  presets: [],
  // A slow zoom into Seahorse Valley and back out.
  sweep: {
    periodMs: 60000,
    targets: [{ view: "zoom", mode: "log", min: 1, max: 10000 }],
    presetValues: { iterations: 600 },
    presetView: { cx: -0.743643887, cy: 0.131825904, zoom: 1 },
  },
  create(canvas, config, ctx) {
    return createEscapeInstance(canvas, config, ctx, {
      getC: () => null,
      span: 3,
      onShiftClick: (re, im) =>
        ctx.openVisualization?.("julia", {
          values: { cRe: Math.round(re * 10000) / 10000, cIm: Math.round(im * 10000) / 10000 },
        }),
    });
  },
};
