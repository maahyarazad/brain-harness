import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateConfig, defaultsOf, applyPreset, describeReplaced } from "../core/knobs.js";
import { createModuleContext } from "../core/moduleContext.js";
import { createLoop } from "../core/loop.js";
import { randomSeed } from "../core/rng.js";
import { decodeConfig } from "../core/shareLink.js";
import { prefersReducedMotion } from "../core/reducedMotion.js";
import { fullscreenSupported, enterFullscreen, exitFullscreen, isFullscreen, FULLSCREEN_EVENTS } from "../core/fullscreen.js";
import { createSweepDriver, sweptKeys, activeSweptKeys, isSweepKey, sweepOnKey } from "../core/sweep.js";
import { QUALITY_KEY, effectiveLevel, hasAuto, scaleFor } from "../core/quality.js";
import { createQualityGovernor } from "../core/qualityGovernor.js";
import KnobPanel from "./KnobPanel.jsx";
import ActionBar from "./ActionBar.jsx";
import StatsReadout from "./StatsReadout.jsx";
import { createStatsStore } from "../core/statsStore.js";
import SeedKnob from "./knobs/SeedKnob.jsx";
import PresetMenu from "./PresetMenu.jsx";
import PlaybackBar from "./PlaybackBar.jsx";
import HowItWorks from "./HowItWorks.jsx";
import ShareMenu from "./ShareMenu.jsx";
import SaveDialog from "./SaveDialog.jsx";

const NO_KEYS = new Set();

const stepsFor = (module, values) =>
  typeof module.stepsPerFrame === "function" ? module.stepsPerFrame(values) : module.stepsPerFrame ?? 1;

// In full screen the drawing area is limited to this many pixels (a 4K screen at 2x would be
// 33 million, far too slow for the heavy visualizations); the browser scales it up to the screen.
const MAX_FULLSCREEN_PIXELS = 4_000_000;
const FULLSCREEN_REFUSED = "Full screen isn't available here, or the browser blocked it.";

// The drawing area is never made smaller than this by a quality scale (device pixels per side).
const MIN_SCALED_PIXELS = 160;
// Pointers a multiTouch module can track at once; more are ignored.
const MAX_POINTERS = 10;

/**
 * Canvas size. `scale` (0 to 1) is the quality level's drawing-resolution factor: it shrinks the
 * pixels drawn, never the size on the page, so the picture is simply coarser (specs/005 contracts/quality.md).
 */
function canvasSize(container, scale = 1) {
  const maxDpr = Math.min(2, window.devicePixelRatio || 1);
  let size;
  if (isFullscreen(container)) {
    const cssW = Math.max(240, container.clientWidth || window.innerWidth || 640);
    const cssH = Math.max(240, container.clientHeight || window.innerHeight || 480);
    const dpr = Math.min(maxDpr, Math.sqrt(MAX_FULLSCREEN_PIXELS / (cssW * cssH)));
    size = { cssW, cssH, dpr, w: Math.floor(cssW * dpr), h: Math.floor(cssH * dpr) };
  } else {
    const cssW = Math.max(240, container?.clientWidth || 640);
    const maxH = Math.max(240, (window.innerHeight || 800) * 0.72);
    const cssH = Math.round(Math.min(cssW * 0.75, maxH));
    size = { cssW, cssH, dpr: maxDpr, w: Math.round(cssW * maxDpr), h: Math.round(cssH * maxDpr) };
  }
  if (scale >= 1) return size;
  return {
    ...size,
    dpr: size.dpr * scale,
    w: Math.max(MIN_SCALED_PIXELS, Math.round(size.w * scale)),
    h: Math.max(MIN_SCALED_PIXELS, Math.round(size.h * scale)),
  };
}

/**
 * Hosts one visualization module: loads it, sizes the canvas, runs its lifecycle,
 * and renders the side panel (presets, knobs, playback, save, share).
 */
export default function Viewer({ entry, initialConfig, sharePayload, saved, active, motionPref, onBack, onOpenViz, onSaved }) {
  const [module, setModule] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [config, setConfigState] = useState(null);
  const [notice, setNotice] = useState(null);
  const [computing, setComputing] = useState(null); // null | progress fraction
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [saveOpen, setSaveOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  // A module can ask for a fresh <canvas> (a canvas keeps the first context type it was given),
  // show a message over the picture, or report that it cannot start (specs/005 module-additions.md).
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [message, setMessage] = useState(null);
  const [unsupported, setUnsupported] = useState(false);

  // Per-frame counters live outside React state: a running animation redraws only the readout, not the
  // viewer and every knob (specs/005 research R8).
  const statsStore = useMemo(() => createStatsStore(), []);

  const canvasRef = useRef(null);
  const forceProcessorRef = useRef(false); // once a restart asked for it, this viewer stays on the processor path
  const governorRef = useRef(null); // Auto quality, animated modules only
  const createInstanceRef = useRef(null);
  const containerRef = useRef(null);
  const configRef = useRef(null);
  const instRef = useRef(null);
  const loopRef = useRef(null);
  const sweepRef = useRef(null);
  const handleRef = useRef(null);
  const progressTimer = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const speedRef = useRef(1);
  const motionRef = useRef(motionPref);
  motionRef.current = motionPref;

  const setConfig = useCallback((c) => {
    configRef.current = c;
    setConfigState(c);
  }, []);

  // 1. Load the module and work out the starting configuration.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = (await entry.load()).default;
        let r;
        if (sharePayload) r = await decodeConfig(m, sharePayload);
        else if (initialConfig) r = validateConfig(m, { ...defaultsOf(m), ...initialConfig, values: { ...defaultsOf(m).values, ...(initialConfig.values ?? {}) } });
        else r = { config: defaultsOf(m), replaced: [] };
        if (cancelled) return;
        configRef.current = r.config;
        setConfigState(r.config);
        setNotice(r.error ?? describeReplaced(r.replaced));
        setModule(m);
      } catch (err) {
        if (!cancelled) setLoadError(String(err?.message ?? err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  const teardown = useCallback(() => {
    loopRef.current?.destroy();
    loopRef.current = null;
    sweepRef.current = null;
    governorRef.current = null;
    try {
      instRef.current?.destroy();
    } catch {
      /* ignore */
    }
    instRef.current = null;
    handleRef.current?.dispose();
    handleRef.current = null;
    clearTimeout(progressTimer.current);
    progressStart.current = null;
    setComputing(null);
  }, []);

  const progressStart = useRef(null);
  const latestProgress = useRef(0);
  const onProgress = useCallback((p) => {
    if (p >= 1) {
      clearTimeout(progressTimer.current);
      progressStart.current = null;
      setComputing(null);
      return;
    }
    latestProgress.current = p;
    if (progressStart.current === null) {
      progressStart.current = performance.now();
      clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => setComputing(latestProgress.current), 1000);
    } else if (performance.now() - progressStart.current >= 1000) {
      setComputing(p);
    }
  }, []);

  // Quality (specs/005 contracts/quality.md). The level's drawing-resolution scale is applied to the
  // canvas here; anything module-specific goes through setQuality() (or update() for modules without one).
  const applyQualityLevel = useCallback(
    (level, { automatic }) => {
      const m = module;
      const canvas = canvasRef.current;
      const inst = instRef.current;
      if (!m || !canvas) return;
      const size = canvasSize(containerRef.current, scaleFor(m, level));
      if (canvas.width !== size.w || canvas.height !== size.h) {
        canvas.style.width = `${size.cssW}px`;
        canvas.style.height = `${size.cssH}px`;
        canvas.width = size.w;
        canvas.height = size.h;
        if (handleRef.current) handleRef.current.ctx.dpr = size.dpr;
        inst?.resize(size.w, size.h);
      }
      if (typeof inst?.setQuality === "function") inst.setQuality(level, { automatic });
      else if (!automatic) scheduleUpdate(QUALITY_KEY);
      loopRef.current?.wake();
    },
    // scheduleUpdate only reads refs, so the copy from this render is as good as any.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [module]
  );

  const startGovernor = useCallback(() => {
    governorRef.current = createQualityGovernor({
      onLevel: (level) => applyQualityLevel(level, { automatic: true }),
      onNotice: setNotice,
    });
  }, [applyQualityLevel]);

  // 2. Create (or recreate) the instance for a configuration.
  const createInstance = useCallback(
    (cfg) => {
      const m = module;
      const canvas = canvasRef.current;
      if (!m || !canvas) return;
      teardown();
      statsStore.clear();
      setMessage(null);
      setUnsupported(false);
      // Auto starts at Medium (never above it). A fixed choice is used as it is.
      if (hasAuto(m) && cfg.values[QUALITY_KEY] === "auto") startGovernor();
      const size = canvasSize(containerRef.current, scaleFor(m, effectiveLevel(cfg.values, governorRef.current?.level())));
      canvas.style.width = `${size.cssW}px`;
      canvas.style.height = `${size.cssH}px`;
      canvas.width = size.w;
      canvas.height = size.h;
      const handle = createModuleContext({
        seed: cfg.seed,
        dpr: size.dpr,
        gpuForced: forceProcessorRef.current ? "off" : "auto",
        onProgress,
        onNotice: setNotice,
        onStats: statsStore.set,
        onMessage: setMessage,
        onRestart: ({ forceProcessor } = {}) => {
          if (forceProcessor) forceProcessorRef.current = true;
          setCanvasEpoch((n) => n + 1);
        },
        onView: (view) => setConfig({ ...configRef.current, view, presetId: configRef.current.presetId }),
        onInput: (input) => setConfig({ ...configRef.current, input, presetId: null }),
        onValues: (vals) => setConfig({ ...configRef.current, values: { ...configRef.current.values, ...vals }, presetId: null }),
        onOpen: (vizId, partial) => onOpenViz?.(vizId, partial),
      });
      handleRef.current = handle;
      try {
        instRef.current = m.create(canvas, cfg, handle.ctx);
      } catch (err) {
        setNotice(`This visualization failed to start: ${err.message}`);
        return;
      }
      setUnsupported(Boolean(instRef.current?.unsupported));
      if (m.sweep) {
        // One step of an animated sweep: the same path as a knob change, marked
        // so modules keep the old picture until the new one is complete.
        const applySweep = (vals, keys, viewPatch) => {
          const c = configRef.current;
          const next = { ...c, values: { ...c.values, ...vals }, view: viewPatch ? { ...c.view, ...viewPatch } : c.view };
          setConfig(next);
          if (typeof m.stepsPerFrame === "function") loopRef.current?.setBaseSteps(stepsFor(m, next.values));
          instRef.current?.update(next, keys, { sweep: true });
          loopRef.current?.wake();
        };
        sweepRef.current = createSweepDriver({
          module: m,
          getConfig: () => configRef.current,
          apply: applySweep,
          isBusy: () => instRef.current?.isBusy?.() ?? false,
          isDone: () => instRef.current?.isDone?.() ?? false,
          getPlaybackSpeed: () => speedRef.current,
        });
      }
      if (m.animated || m.sweep) {
        // Still modules get a loop only to drive their sweep: they are never
        // stepped or re-rendered per frame (the sweep's update() redraws them).
        loopRef.current = createLoop({
          step: m.animated ? () => instRef.current?.step() : () => {},
          render: m.animated ? () => instRef.current?.render() : () => {},
          onFrame: (ts) => {
            governorRef.current?.frame(ts);
            if (configRef.current?.values.sweep) sweepRef.current?.tick();
          },
          // A finished run (a completed sort or maze) needs no more frames until something changes.
          // A sweep needs the loop to start the next run, so a loop with a sweep on never idles.
          isIdle: () => !configRef.current?.values.sweep && (instRef.current?.isIdle?.() ?? false),
          baseSteps: stepsFor(m, cfg.values),
          onStateChange: setPlaying,
        });
        loopRef.current.setSpeed(speedRef.current);
        const moving = m.animated || cfg.values.sweep;
        if (moving && activeRef.current && !prefersReducedMotion(motionRef.current)) loopRef.current.play();
        else setPlaying(false);
      }
    },
    [module, teardown, onProgress, onOpenViz, setConfig, startGovernor, statsStore]
  );
  createInstanceRef.current = createInstance;

  useEffect(() => {
    if (module && configRef.current) createInstance(configRef.current);
    return teardown;
    // Only when the module itself changes; later config changes go through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  // A module asked for a fresh canvas (ctx.requestRestart): React has mounted a new <canvas> by now,
  // so create the instance again, with the same settings, on it.
  useEffect(() => {
    if (canvasEpoch > 0 && configRef.current) createInstanceRef.current(configRef.current);
  }, [canvasEpoch]);

  // 3. Resize: keep settings, just tell the instance.
  useEffect(() => {
    if (!module) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last = null;
    const ro = new ResizeObserver(() => {
      const level = effectiveLevel(configRef.current?.values ?? {}, governorRef.current?.level());
      const size = canvasSize(el, scaleFor(module, level));
      const key = `${size.w}x${size.h}`;
      if (key === last) return;
      const first = last === null;
      last = key;
      if (first) return;
      const canvas = canvasRef.current;
      canvas.style.width = `${size.cssW}px`;
      canvas.style.height = `${size.cssH}px`;
      canvas.width = size.w;
      canvas.height = size.h;
      if (handleRef.current) handleRef.current.ctx.dpr = size.dpr; // lowered in full screen on big displays
      instRef.current?.resize(size.w, size.h);
      loopRef.current?.wake();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [module]);

  // 4. Pause when the studio is hidden.
  useEffect(() => {
    if (!active) loopRef.current?.pause();
  }, [active]);

  // 5. Full screen: follow the browser (Esc leaves it without telling us), and leave it when this viewer goes away.
  useEffect(() => {
    const el = containerRef.current;
    setCanFullscreen(fullscreenSupported(el));
    const sync = () => setFullscreen(isFullscreen(el));
    FULLSCREEN_EVENTS.forEach((e) => document.addEventListener(e, sync));
    return () => {
      FULLSCREEN_EVENTS.forEach((e) => document.removeEventListener(e, sync));
      if (isFullscreen(el)) exitFullscreen();
    };
  }, []);

  async function onFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (isFullscreen(el)) {
      await exitFullscreen();
      return;
    }
    const r = await enterFullscreen(el);
    if (!r.ok) {
      setNotice(FULLSCREEN_REFUSED);
      return;
    }
    // The canvas keeps the keyboard, so Space (play/pause) and the module's own keys keep working.
    canvasRef.current?.focus({ preventScroll: true });
  }

  // --- Config changes from the panel ---
  // Every handler here is a useCallback over refs and state setters, so the memoized children they are
  // handed to (the knobs, the presets, the playback bar) see the same function on every redraw.

  const pendingKeys = useRef(new Set());
  const updateFrame = useRef(null);
  const scheduleUpdate = useCallback((key) => {
    pendingKeys.current.add(key);
    if (updateFrame.current !== null) return;
    const run = () => {
      updateFrame.current = null;
      const keys = [...pendingKeys.current];
      pendingKeys.current.clear();
      instRef.current?.update(configRef.current, keys);
      loopRef.current?.wake(); // a finished run starts again when its settings change
    };
    updateFrame.current = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : setTimeout(run, 0);
  }, []);

  const onKnobChange = useCallback(
    (key, value) => {
      const cfg = configRef.current;
      const next = { ...cfg, values: { ...cfg.values, [key]: value }, presetId: null };
      setConfig(next);
      setNotice(null);
      // The shell's own sweep settings never reach the module's update(). Switching one
      // target in or out needs no reset: the driver notices it on its next tick.
      if (isSweepKey(key)) {
        if (key === "sweep") {
          sweepRef.current?.reset();
          loopRef.current?.wake(); // an idle loop has to start driving the sweep
          // A still module only moves while its sweep is on.
          if (!module.animated) {
            if (value && activeRef.current && !prefersReducedMotion(motionRef.current)) loopRef.current?.play();
            else if (!value) loopRef.current?.pause();
          }
        }
        return;
      }
      if (typeof module.stepsPerFrame === "function") loopRef.current?.setBaseSteps(stepsFor(module, next.values));
      if (key === QUALITY_KEY) {
        // Quality is the shell's own setting too: a fixed level stops Auto, and Auto starts again from Medium.
        if (hasAuto(module) && value === "auto") {
          startGovernor();
          applyQualityLevel("medium", { automatic: true });
        } else {
          governorRef.current = null;
          applyQualityLevel(value === "auto" ? "medium" : value, { automatic: false });
        }
        return;
      }
      scheduleUpdate(key);
    },
    [module, setConfig, startGovernor, applyQualityLevel, scheduleUpdate]
  );

  const restartWith = useCallback(
    (next) => {
      setConfig(next);
      setNotice(null);
      // A canvas keeps the context type it was first given, and a GPU instance gives its context back when
      // it is destroyed, so the same canvas cannot start another GPU instance. Mount a fresh one: the
      // epoch effect creates the instance on it, with this configuration (specs/005 research R2).
      if (instRef.current?.path === "gpu") {
        setCanvasEpoch((n) => n + 1);
        return;
      }
      createInstance(next);
    },
    [setConfig, createInstance]
  );

  const onReset = useCallback(() => restartWith(defaultsOf(module)), [module, restartWith]);

  const onPreset = useCallback(
    (id) => {
      const p = applyPreset(module, id);
      if (p) {
        const view = p.view ?? (module.defaultView ? { ...module.defaultView } : null);
        // applyPreset starts from the defaults, which would reset the visitor's Quality choice.
        const current = configRef.current.values[QUALITY_KEY];
        const values = current === undefined ? p.values : { ...p.values, [QUALITY_KEY]: current };
        restartWith({ ...configRef.current, values, input: p.input, presetId: id, view });
      }
    },
    [module, restartWith]
  );

  const onAction = useCallback((id) => {
    instRef.current?.action?.(id);
    loopRef.current?.wake();
  }, []);

  const onRestartInstance = useCallback(() => {
    instRef.current?.reset?.();
    loopRef.current?.wake();
  }, []);

  const onSeed = useCallback((seed) => restartWith({ ...configRef.current, seed }), [restartWith]);
  const onRandomSeed = useCallback(() => onSeed(randomSeed()), [onSeed]);

  const onPlay = useCallback(() => loopRef.current?.play(), []);
  const onPause = useCallback(() => loopRef.current?.pause(), []);
  const onStep = useCallback(() => loopRef.current?.stepOnce(), []);
  const onSpeed = useCallback((s) => {
    speedRef.current = s;
    setSpeed(s);
    loopRef.current?.setSpeed(s);
  }, []);
  const onToggleSweep = useCallback((key, on) => onKnobChange(sweepOnKey({ key }), on), [onKnobChange]);

  // Derived values the panel receives: computed again only when what they depend on changes.
  const sweepOn = Boolean(config?.values.sweep);
  const sweepValues = config?.values;
  const sweepingKeys = useMemo(
    () => (module && sweepOn ? new Set(activeSweptKeys(module, sweepValues)) : NO_KEYS),
    [module, sweepOn, sweepValues]
  );
  const sweepable = useMemo(() => (module && sweepOn ? new Set(sweptKeys(module)) : NO_KEYS), [module, sweepOn]);
  const seed = config?.seed;
  const seedKnob = useMemo(
    () => (module?.random ? <SeedKnob seed={seed} onChange={onSeed} onRandomize={onRandomSeed} /> : null),
    [module, seed, onSeed, onRandomSeed]
  );
  // Recording is an explicit request to see motion, so it starts playback even when reduced motion
  // started the animation paused.
  const onRecordStart = useMemo(() => (module?.animated || sweepOn ? () => loopRef.current?.play() : undefined), [module, sweepOn]);

  // --- Canvas input ---

  function toCanvas(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / (rect.width || canvas.width);
    const sy = canvas.height / (rect.height || canvas.height);
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function send(type, e, extra = {}) {
    if (!module?.interactive || !instRef.current?.pointer) return undefined;
    const p = e && "clientX" in e ? toCanvas(e) : { x: 0, y: 0 };
    const result = instRef.current.pointer({
      type,
      ...p,
      button: e?.button ?? 0,
      shiftKey: Boolean(e?.shiftKey),
      ctrlKey: Boolean(e?.ctrlKey),
      ...extra,
    });
    loopRef.current?.wake(); // input can change what a finished run shows
    return result;
  }

  // Active pointers (pointerId → canvas position). With two pointers down the
  // shell turns their movement into "pinch" events instead of drags.
  const pointers = useRef(new Map());
  const pinchDist = useRef(null);

  function pinchState() {
    const [a, b] = [...pointers.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function onPointerDown(e) {
    if (module?.interactive) e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toCanvas(e);
    if (module?.multiTouch) {
      // Every finger is its own stroke: no pinch, no cancelled drag (contracts/module-additions.md).
      if (pointers.current.size >= MAX_POINTERS && !pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, p);
      send("down", e, { pointerId: e.pointerId });
      return;
    }
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      // The first pointer was dragging: tell the module to drop that drag.
      send("up", e, { ...p, cancelDrag: true });
      pinchDist.current = pinchState().dist;
      return;
    }
    if (pointers.current.size > 2) return;
    send("down", e);
  }

  function onPointerMove(e) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, toCanvas(e));
    if (module?.multiTouch) {
      send("move", e, { pointerId: e.pointerId });
      return;
    }
    if (pointers.current.size >= 2) {
      if (pointers.current.size !== 2) return;
      const { x, y, dist } = pinchState();
      const prev = pinchDist.current;
      pinchDist.current = dist;
      if (prev !== null && prev >= 1 && dist >= 1) send("pinch", e, { x, y, scale: dist / prev });
      return;
    }
    send("move", e);
  }

  function onPointerEnd(type, e) {
    if (module?.multiTouch) {
      const known = pointers.current.delete(e.pointerId);
      if (!known && type === "up") return; // an extra finger we never forwarded
      send(type, e, { pointerId: e.pointerId });
      return;
    }
    const wasPinching = pointers.current.size >= 2;
    const known = pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    // Lifting a finger of a pinch must not start or finish a drag.
    if (wasPinching) return;
    if (!known && type === "up") return;
    send(type, e);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !module?.interactive) return;
    const zoomable = Boolean(module.defaultView);
    const onWheel = (e) => {
      // Normalize to pixels: Firefox reports lines (deltaMode 1) for many mice.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.height : 1;
      if (send("wheel", e, { deltaY: e.deltaY * unit }) !== undefined || zoomable) e.preventDefault();
    };
    // Safari reports trackpad pinch as gesture events, not ctrl + wheel.
    let lastScale = 1;
    const onGestureStart = (e) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (e) => {
      e.preventDefault();
      if (!(e.scale > 0)) return;
      send("pinch", e, { scale: e.scale / lastScale });
      lastScale = e.scale;
    };
    const onGestureEnd = (e) => e.preventDefault();
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("gesturestart", onGestureStart, { passive: false });
    canvas.addEventListener("gesturechange", onGestureChange, { passive: false });
    canvas.addEventListener("gestureend", onGestureEnd, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("gesturestart", onGestureStart);
      canvas.removeEventListener("gesturechange", onGestureChange);
      canvas.removeEventListener("gestureend", onGestureEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  function zoomButton(key) {
    send("key", null, { key });
    canvasRef.current?.focus({ preventScroll: true });
  }

  function onResetView() {
    restartWith({ ...configRef.current, view: { ...module.defaultView } });
  }

  function onKeyDown(e) {
    if (send("key", null, { key: e.key }) === true) {
      e.preventDefault();
      return;
    }
    if (!loopRef.current || (!module.animated && !configRef.current.values.sweep)) return;
    if (e.key === " ") {
      e.preventDefault();
      loopRef.current?.isPlaying() ? loopRef.current.pause() : loopRef.current?.play();
    } else if (e.key === ".") {
      loopRef.current?.stepOnce();
    } else if (e.key === "r" || e.key === "R") {
      instRef.current?.reset?.();
    }
  }

  if (loadError) {
    return (
      <div className="viewer-error" role="alert">
        <p>This visualization couldn't load: {loadError}</p>
        <button type="button" className="btn" onClick={onBack}>
          Back to catalog
        </button>
      </div>
    );
  }

  const ready = module && config;
  const zoomSweeping = sweepingKeys.has("view");
  const interactionHint = module?.interactive ? `${entry.name}. Interactive: see How it works for controls.` : entry.name;

  return (
    <div className="viewer">
      <div className="viewer-toolbar">
        <button type="button" className="btn" onClick={onBack}>
          ← Catalog
        </button>
        <h2>
          {saved ? saved.name : entry.name}
          {saved && <span className="viewer-sub"> · {entry.name}</span>}
        </h2>
        <span className="spacer" />
        {ready && !unsupported && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => setSaveOpen(true)}>
              Save
            </button>
            <ShareMenu
              module={module}
              config={config}
              canvasRef={canvasRef}
              vizId={entry.id}
              name={saved?.name ?? entry.name}
              active={active}
              recordable={module.animated || module.interactive || Boolean(config.values.sweep)}
              onRecordStart={onRecordStart}
            />
          </>
        )}
      </div>

      <div className="viewer-body">
        <div className="viewer-stage">
          <div className="canvas-wrap" ref={containerRef}>
            <canvas
              key={canvasEpoch}
              ref={canvasRef}
              className="viz-canvas"
              tabIndex={0}
              role="img"
              aria-label={interactionHint}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerEnd("up", e)}
              onPointerCancel={(e) => onPointerEnd("up", e)}
              onPointerLeave={(e) => onPointerEnd("leave", e)}
              onDoubleClick={(e) => send("dblclick", e)}
              onContextMenu={(e) => module?.interactive && e.preventDefault()}
              onKeyDown={onKeyDown}
            />
            {ready && module.interactive && module.defaultView && (
              <div className="zoom-controls" role="group" aria-label="Zoom">
                <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomButton("+")}>
                  +
                </button>
                <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomButton("-")}>
                  −
                </button>
                <button type="button" aria-label="Reset view" title="Reset view" onClick={onResetView}>
                  ⟲
                </button>
              </div>
            )}
            {ready && canFullscreen && (
              <button
                type="button"
                className="fullscreen-btn"
                aria-pressed={fullscreen}
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
                onClick={onFullscreen}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d={fullscreen ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} />
                </svg>
              </button>
            )}
            {ready && config.values.sweep && sweptKeys(module).includes("view") && (
              <button
                type="button"
                className={`sweep-badge sweep-badge-zoom${zoomSweeping ? "" : " sweep-badge-off"}`}
                id="sweep-badge-view"
                aria-label="Sweep zoom"
                aria-pressed={zoomSweeping}
                onClick={() => onKnobChange(sweepOnKey({ view: "zoom" }), !zoomSweeping)}
              >
                {zoomSweeping ? "⟳ sweeping zoom" : "Sweep zoom"}
              </button>
            )}
            {!ready && <p className="canvas-loading">Loading…</p>}
            {message && (
              <div className="canvas-message" role="status">
                <p>{message.text}</p>
                {message.actionLabel && (
                  <button type="button" className="btn btn-primary" onClick={() => message.onAction?.()}>
                    {message.actionLabel}
                  </button>
                )}
              </div>
            )}
            {computing !== null && (
              <div className="progress" role="progressbar" aria-label="Drawing" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(computing * 100)}>
                <div className="progress-bar" style={{ width: `${Math.round(computing * 100)}%` }} />
              </div>
            )}
          </div>
          {ready && !unsupported && (module.animated || config.values.sweep) && (
            <PlaybackBar
              playing={playing}
              speed={speed}
              onPlay={onPlay}
              onPause={onPause}
              onStep={onStep}
              onSpeed={onSpeed}
              onReset={module.animated ? onRestartInstance : undefined}
            />
          )}
          {ready && !unsupported && module.actions?.length > 0 && <ActionBar actions={module.actions} onAction={onAction} />}
          <div className="viewer-status" aria-live="polite">
            {notice && <p className="studio-notice">{notice}</p>}
            <StatsReadout store={statsStore} />
          </div>
        </div>

        <aside className="viewer-side">
          <HowItWorks text={module?.howItWorks ?? entry.summary} />
          {ready && !unsupported && (
            <>
              <PresetMenu presets={module.presets} activeId={config.presetId} onApply={onPreset} />
              <KnobPanel
                module={module}
                values={config.values}
                onChange={onKnobChange}
                onReset={onReset}
                sweeping={sweepingKeys}
                sweepable={sweepable}
                onToggleSweep={onToggleSweep}
              >
                {seedKnob}
              </KnobPanel>
            </>
          )}
        </aside>
      </div>

      {saveOpen && ready && (
        <SaveDialog
          vizId={entry.id}
          defaultName={saved?.name ?? entry.name}
          saved={saved}
          config={config}
          canvas={canvasRef.current}
          onClose={() => setSaveOpen(false)}
          onSaved={(record) => {
            setSaveOpen(false);
            onSaved?.(record);
          }}
        />
      )}
    </div>
  );
}
