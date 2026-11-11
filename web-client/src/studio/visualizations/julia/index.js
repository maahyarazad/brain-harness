import { createEscapeInstance, validateView } from "../mandelbrot/escapeView.js";
import { paletteKnob } from "../../core/palettes.js";

const DEFAULT_VIEW = { cx: 0, cy: 0, zoom: 1 };

export default {
  id: "julia",
  name: "Julia set",
  howItWorks:
    "Pick a fixed complex number c. For each starting point z, repeat z → z² + c and color it by how fast it escapes. Every c gives a different Julia set: c values inside the Mandelbrot set give connected shapes, those outside give dust. Drag to pan and scroll to zoom.",
  animated: false,
  random: false,
  interactive: true,
  defaultView: DEFAULT_VIEW,
  validateView: (v) => validateView(v, DEFAULT_VIEW),
  knobs: [
    { key: "cRe", label: "c, real part", type: "range", min: -2, max: 2, step: 0.0001, default: -0.8 },
    { key: "cIm", label: "c, imaginary part", type: "range", min: -2, max: 2, step: 0.0001, default: 0.156 },
    { key: "iterations", label: "Iteration limit", type: "range", min: 50, max: 5000, step: 1, default: 300, scale: "log", live: false },
    paletteKnob("palette", "magma"),
    { key: "smooth", label: "Smooth coloring", type: "toggle", default: true },
  ],
  presets: [
    { id: "default", name: "Spiral (−0.8 + 0.156i)", values: { cRe: -0.8, cIm: 0.156 } },
    { id: "dendrite", name: "Dendrite (i)", values: { cRe: 0, cIm: 1 } },
    { id: "rabbit", name: "Douady rabbit", values: { cRe: -0.123, cIm: 0.745 } },
    { id: "sanmarco", name: "San Marco (−0.75)", values: { cRe: -0.75, cIm: 0 } },
    { id: "siegel", name: "Siegel disk", values: { cRe: -0.391, cIm: -0.587 } },
  ],
  create(canvas, config, ctx) {
    return createEscapeInstance(canvas, config, ctx, { getC: (v) => [v.cRe, v.cIm], span: 3.2 });
  },
};
