// Fluid simulation: a simplified Navier–Stokes fluid on the graphics card
// (specs/005-navier-stokes-fluid-performance/contracts/fluid-simulation.md).
import { openGpu } from "../_shared/gpu/index.js";
import { clear } from "../_shared/draw.js";
import { BG } from "../_shared/instance.js";
import { paletteKnob } from "../../core/palettes.js";
import { createFluidInstance } from "./gpu.js";
import { levelValues } from "./kernel.js";

export const UNSUPPORTED_TEXT =
  "This visualization needs graphics acceleration (WebGL), which isn't available in this browser or on this device. The other visualizations still work.";

/**
 * What a module that could not start looks like to the shell: it answers every call as a no-op, paints the
 * studio's background so the canvas is not a transparent hole, and tells the visitor why (FR-016).
 */
function createUnsupported(canvas, ctx) {
  const g = canvas.getContext("2d");
  const paint = () => {
    if (g) clear(g, BG);
  };
  paint();
  ctx.showMessage({ text: UNSUPPORTED_TEXT });
  return {
    unsupported: true,
    path: "processor",
    update() {},
    resize: paint,
    setQuality() {},
    step() {},
    render() {},
    reset() {},
    action() {},
    pointer() {},
    destroy() {
      ctx.clearMessage();
    },
  };
}

export default {
  id: "fluid-simulation",
  name: "Fluid simulation",
  howItWorks:
    "This is a fluid with colored ink in it. Drag across the picture to push the fluid and drop ink along the way: a faster drag pushes harder. " +
    "Each moment, the simulation carries the ink and the motion along with the flow, so swirls form and stretch. " +
    "Pressure keeps the fluid from piling up or leaving gaps, and the more Pressure iterations it uses, the more evenly spread the fluid stays, at the cost of more work every frame. " +
    "Curl keeps small swirls alive instead of letting them smooth away. " +
    "Velocity dissipation slows the motion over time, while density dissipation fades the ink, so low values give long, lingering trails and high values give quick bursts that vanish. " +
    "Burst adds several splashes at once, Clear empties the picture, and Quality trades detail for speed.",
  animated: true,
  random: true,
  interactive: true,
  multiTouch: true,
  stepsPerFrame: 1,
  actions: [
    { id: "burst", label: "Burst", title: "Add several splashes (B)", key: "b" },
    { id: "clear", label: "Clear", title: "Empty the picture (C)", key: "c" },
  ],
  knobs: [
    { key: "pressureIterations", label: "Pressure iterations", type: "range", min: 4, max: 60, step: 1, default: 20 },
    { key: "pressure", label: "Pressure", type: "range", min: 0, max: 1, step: 0.01, default: 0.8 },
    { key: "curl", label: "Curl", type: "range", min: 0, max: 50, step: 1, default: 30 },
    { key: "splatRadius", label: "Splat radius", type: "range", min: 0.05, max: 1, step: 0.01, default: 0.25 },
    { key: "splatForce", label: "Splat force", type: "range", min: 500, max: 12000, step: 100, default: 6000 },
    { key: "velocityDissipation", label: "Velocity dissipation", type: "range", min: 0, max: 4, step: 0.01, default: 0.2 },
    // The lowest value still fades (about 10 s): at 0 the ink only ever accumulates and heavy stirring ends as a solid wash.
    { key: "densityDissipation", label: "Density dissipation", type: "range", min: 0.1, max: 4, step: 0.01, default: 1 },
    paletteKnob("palette", "magma"),
  ],
  presets: [
    { id: "lingering-ink", name: "Lingering ink", values: { velocityDissipation: 0.05, densityDissipation: 0.2, curl: 20 } },
    { id: "quick-splashes", name: "Quick splashes", values: { velocityDissipation: 1.5, densityDissipation: 2.5, curl: 10 } },
    { id: "turbulent", name: "Turbulent", values: { velocityDissipation: 0.1, densityDissipation: 0.6, curl: 50, splatForce: 9000 } },
  ],
  // Two settings drift on their own, so the effect of both can be seen without touching anything.
  sweep: {
    periodMs: 40000,
    targets: [
      { key: "curl", mode: "wave", min: 5, max: 45 },
      { key: "velocityDissipation", mode: "wave", min: 0.05, max: 2, phase: 0.25 },
    ],
  },
  // The catalog card's sample picture (contracts/thumbnail.md).
  thumbnail: { presetId: "lingering-ink", steps: 120 },
  quality: { levers: { low: levelValues("low"), medium: levelValues("medium"), high: levelValues("high") } },
  create(canvas, config, ctx) {
    let inst = null;
    const gpu = openGpu(canvas, {
      need: ["halfFloatTarget"],
      ctx,
      onUnrecovered: () => inst?.handleUnrecovered?.(),
    });
    if (!gpu) return createUnsupported(canvas, ctx);
    inst = createFluidInstance(canvas, gpu, config, ctx);
    return inst;
  },
};
