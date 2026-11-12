import { ALGORITHMS, initialArray } from "./kernel.js";
import { BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

export default {
  id: "sorting",
  name: "Sorting algorithms",
  howItWorks:
    "Each bar is a number; its height is its value. A sorting algorithm compares two values at a time (highlighted) and swaps or moves them until everything is in order. Bubble, insertion and selection sort need about n² comparisons; quick, merge and heap sort need about n·log n, which is why they finish so much faster on big arrays. Watch the counters.",
  animated: true,
  random: true,
  interactive: false,
  stepsPerFrame: (v) => Math.max(1, Math.round(v.size / 40)),
  knobs: [
    {
      key: "algorithm", label: "Algorithm", type: "choice", default: "quick",
      options: [
        { value: "bubble", label: "Bubble sort" },
        { value: "insertion", label: "Insertion sort" },
        { value: "selection", label: "Selection sort" },
        { value: "quick", label: "Quick sort" },
        { value: "merge", label: "Merge sort" },
        { value: "heap", label: "Heap sort" },
      ],
    },
    { key: "size", label: "Array size", type: "range", min: 8, max: 1000, step: 1, default: 120, scale: "log", live: false },
    {
      key: "order", label: "Starting order", type: "choice", default: "random",
      options: [
        { value: "random", label: "Random" },
        { value: "nearly-sorted", label: "Nearly sorted" },
        { value: "reversed", label: "Reversed" },
        { value: "few-unique", label: "Few unique values" },
      ],
    },
    {
      key: "display", label: "Display", type: "choice", default: "bars",
      options: [{ value: "bars", label: "Bars" }, { value: "dots", label: "Dots" }],
    },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "bubble-small", name: "Bubble sort, 40", values: { algorithm: "bubble", size: 40 } },
    { id: "quick-big", name: "Quick sort, 500", values: { algorithm: "quick", size: 500, display: "dots" } },
    { id: "insertion-nearly", name: "Insertion on nearly sorted", values: { algorithm: "insertion", order: "nearly-sorted", size: 200 } },
    { id: "heap-reversed", name: "Heap sort, reversed", values: { algorithm: "heap", order: "reversed", size: 200 } },
  ],
  // Each algorithm runs to the end, stays for a moment, then the next one starts.
  sweep: { kind: "run", targets: [{ key: "algorithm", mode: "steps", list: ["bubble", "insertion", "selection", "quick", "merge", "heap"] }] },
  // The catalog card's sample picture (contracts/thumbnail.md).
  thumbnail: { values: { size: 80 }, steps: 400 },
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let arr, view, gen, last, comparisons, swaps, done;

    function init() {
      arr = initialArray(cfg.values.size, cfg.values.order, ctx.rng);
      view = arr.slice();
      gen = ALGORITHMS[cfg.values.algorithm](arr);
      last = null;
      comparisons = 0;
      swaps = 0;
      done = false;
    }

    function render() {
      const { width: w, height: h } = canvas;
      clear(g, BG);
      const n = view.length;
      const max = Math.max(...view);
      const bw = w / n;
      const pal = cfg.values.palette;
      for (let i = 0; i < n; i++) {
        const bh = (view[i] / max) * h * 0.92;
        let color = ctx.color(pal, 0.15 + 0.85 * (view[i] / max));
        if (!done && last && (last.i === i || last.j === i)) color = last.op === "compare" ? "#ffd166" : "#ff5d5d";
        g.fillStyle = color;
        if (cfg.values.display === "bars") g.fillRect(i * bw, h - bh, Math.max(1, bw - (bw > 3 ? 1 : 0)), bh);
        else {
          const r = Math.max(1.5, Math.min(bw / 2, 4 * ctx.dpr));
          g.beginPath();
          g.arc(i * bw + bw / 2, h - bh, r, 0, 2 * Math.PI);
          g.fill();
        }
      }
      ctx.reportStats({ comparisons, swaps, status: done ? "Sorted" : "Sorting" });
    }

    init();
    render();
    return {
      update(c, changed = []) {
        cfg = c;
        if (changed.some((k) => ["algorithm", "size", "order"].includes(k))) init();
        render();
      },
      step() {
        if (done) return;
        const r = gen.next();
        if (r.done) {
          done = true;
          last = null;
          return;
        }
        last = r.value;
        if (last.op === "compare") comparisons++;
        else if (last.op === "swap") {
          swaps++;
          [view[last.i], view[last.j]] = [view[last.j], view[last.i]];
        } else {
          swaps++;
          view[last.i] = last.value;
        }
      },
      /** The array is sorted: an animated sweep can start the next algorithm. */
      isDone: () => done,
      render,
      reset() {
        init();
        render();
      },
      resize: render,
      destroy() {},
    };
  },
};
