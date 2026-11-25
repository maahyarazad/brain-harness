// The ctx object handed to visualization modules (see contracts/visualization-module.md).
import { createRng } from "./rng.js";
import { paletteLut, paletteColor } from "./palettes.js";
import { runKernel } from "./workerPool.js";
import { progressive } from "./progressive.js";

export function createModuleContext({
  seed = 0,
  dpr = 1,
  onProgress = () => {},
  onNotice = () => {},
  onStats = () => {},
  onView = () => {},
  onInput = () => {},
  onValues = () => {},
  onOpen = () => {},
  onMessage = () => {},
  onRestart = () => {},
  gpuForced = "auto",
} = {}) {
  const tasks = new Set();
  let disposed = false;

  function track(task) {
    tasks.add(task);
    const done = () => tasks.delete(task);
    task.promise.then(done, done);
    return task;
  }

  const ctx = {
    rng: createRng(seed),
    dpr,
    palette: paletteLut,
    color: paletteColor,
    runKernel(name, args, opts = {}) {
      return track(runKernel(name, args, { ...opts, onProgress: opts.onProgress }));
    },
    progressive(generator, opts = {}) {
      return track(progressive(generator, { onProgress: (p) => !disposed && onProgress(p), ...opts }));
    },
    reportProgress: (p) => !disposed && onProgress(p),
    reportNotice: (text) => !disposed && onNotice(text),
    reportStats: (stats) => !disposed && onStats(stats),
    setView: (view) => !disposed && onView(view),
    setInput: (input) => !disposed && onInput(input),
    setValues: (values) => !disposed && onValues(values),
    openVisualization: (vizId, config) => !disposed && onOpen(vizId, config),
    /** "off" makes openGpu() return null, so a module takes its processor path (specs/005 R2). */
    gpuForced: gpuForced === "off" ? "off" : "auto",
    /** A plain-language message over the canvas, with an optional action button. */
    showMessage(message) {
      if (disposed || typeof message?.text !== "string" || !message.text) return;
      onMessage({ ...message });
    },
    clearMessage: () => !disposed && onMessage(null),
    /** Ask the shell to mount a fresh canvas and create the instance again. */
    requestRestart: (options = {}) => !disposed && onRestart({ ...options }),
    /** Resolves when no kernel or progressive task is pending. */
    async idle() {
      while (tasks.size) {
        await Promise.allSettled([...tasks].map((t) => t.promise));
      }
    },
  };

  return {
    ctx,
    dispose() {
      disposed = true;
      for (const t of tasks) t.cancel();
      tasks.clear();
    },
  };
}
