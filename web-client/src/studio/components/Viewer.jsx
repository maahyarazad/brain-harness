import { useCallback, useEffect, useRef, useState } from "react";
import { validateConfig, defaultsOf, applyPreset, describeReplaced } from "../core/knobs.js";
import { createModuleContext } from "../core/moduleContext.js";
import { createLoop } from "../core/loop.js";
import { randomSeed } from "../core/rng.js";
import { decodeConfig } from "../core/shareLink.js";
import { prefersReducedMotion } from "../core/reducedMotion.js";
import { createSweepDriver, sweptKeys } from "../core/sweep.js";
import KnobPanel from "./KnobPanel.jsx";
import SeedKnob from "./knobs/SeedKnob.jsx";
import PresetMenu from "./PresetMenu.jsx";
import PlaybackBar from "./PlaybackBar.jsx";
import HowItWorks from "./HowItWorks.jsx";
import ShareMenu from "./ShareMenu.jsx";
import SaveDialog from "./SaveDialog.jsx";

// The shell's own sweep knobs: they never reach the module's update().
const SHELL_KEYS = new Set(["sweep", "sweepSpeed"]);
const NO_KEYS = new Set();

const stepsFor = (module, values) =>
  typeof module.stepsPerFrame === "function" ? module.stepsPerFrame(values) : module.stepsPerFrame ?? 1;

function canvasSize(container) {
  const cssW = Math.max(240, container?.clientWidth || 640);
  const maxH = Math.max(240, (window.innerHeight || 800) * 0.72);
  const cssH = Math.round(Math.min(cssW * 0.75, maxH));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return { cssW, cssH, dpr, w: Math.round(cssW * dpr), h: Math.round(cssH * dpr) };
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
  const [stats, setStats] = useState(null);
  const [computing, setComputing] = useState(null); // null | progress fraction
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [saveOpen, setSaveOpen] = useState(false);

  const canvasRef = useRef(null);
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

  // 2. Create (or recreate) the instance for a configuration.
  const createInstance = useCallback(
    (cfg) => {
      const m = module;
      const canvas = canvasRef.current;
      if (!m || !canvas) return;
      teardown();
      setStats(null);
      const size = canvasSize(containerRef.current);
      canvas.style.width = `${size.cssW}px`;
      canvas.style.height = `${size.cssH}px`;
      canvas.width = size.w;
      canvas.height = size.h;
      const handle = createModuleContext({
        seed: cfg.seed,
        dpr: size.dpr,
        onProgress,
        onNotice: setNotice,
        onStats: setStats,
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
      if (m.sweep) {
        // One step of an animated sweep: the same path as a knob change, marked
        // so modules keep the old picture until the new one is complete.
        const applySweep = (vals, keys, viewPatch) => {
          const c = configRef.current;
          const next = { ...c, values: { ...c.values, ...vals }, view: viewPatch ? { ...c.view, ...viewPatch } : c.view };
          setConfig(next);
          if (typeof m.stepsPerFrame === "function") loopRef.current?.setBaseSteps(stepsFor(m, next.values));
          instRef.current?.update(next, keys, { sweep: true });
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
          onFrame: () => {
            if (configRef.current?.values.sweep) sweepRef.current?.tick();
          },
          baseSteps: stepsFor(m, cfg.values),
          onStateChange: setPlaying,
        });
        loopRef.current.setSpeed(speedRef.current);
        const moving = m.animated || cfg.values.sweep;
        if (moving && activeRef.current && !prefersReducedMotion(motionRef.current)) loopRef.current.play();
        else setPlaying(false);
      }
    },
    [module, teardown, onProgress, onOpenViz, setConfig]
  );

  useEffect(() => {
    if (module && configRef.current) createInstance(configRef.current);
    return teardown;
    // Only when the module itself changes; later config changes go through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  // 3. Resize: keep settings, just tell the instance.
  useEffect(() => {
    if (!module) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last = null;
    const ro = new ResizeObserver(() => {
      const size = canvasSize(el);
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
      instRef.current?.resize(size.w, size.h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [module]);

  // 4. Pause when the studio is hidden.
  useEffect(() => {
    if (!active) loopRef.current?.pause();
  }, [active]);

  // --- Config changes from the panel ---

  const pendingKeys = useRef(new Set());
  const updateFrame = useRef(null);
  function scheduleUpdate(key) {
    pendingKeys.current.add(key);
    if (updateFrame.current !== null) return;
    const run = () => {
      updateFrame.current = null;
      const keys = [...pendingKeys.current];
      pendingKeys.current.clear();
      instRef.current?.update(configRef.current, keys);
    };
    updateFrame.current = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : setTimeout(run, 0);
  }

  function onKnobChange(key, value) {
    const cfg = configRef.current;
    const next = { ...cfg, values: { ...cfg.values, [key]: value }, presetId: null };
    setConfig(next);
    setNotice(null);
    if (SHELL_KEYS.has(key)) {
      if (key === "sweep") {
        sweepRef.current?.reset();
        // A still module only moves while its sweep is on.
        if (!module.animated) {
          if (value && activeRef.current && !prefersReducedMotion(motionRef.current)) loopRef.current?.play();
          else if (!value) loopRef.current?.pause();
        }
      }
      return;
    }
    if (typeof module.stepsPerFrame === "function") loopRef.current?.setBaseSteps(stepsFor(module, next.values));
    scheduleUpdate(key);
  }

  function restartWith(next) {
    setConfig(next);
    setNotice(null);
    createInstance(next);
  }

  function onReset() {
    restartWith(defaultsOf(module));
  }

  function onPreset(id) {
    const p = applyPreset(module, id);
    if (p) {
      const view = p.view ?? (module.defaultView ? { ...module.defaultView } : null);
      restartWith({ ...configRef.current, values: p.values, input: p.input, presetId: id, view });
    }
  }

  function onSeed(seed) {
    restartWith({ ...configRef.current, seed });
  }

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
    return instRef.current.pointer({
      type,
      ...p,
      button: e?.button ?? 0,
      shiftKey: Boolean(e?.shiftKey),
      ctrlKey: Boolean(e?.ctrlKey),
      ...extra,
    });
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
        {ready && (
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
              // Recording is an explicit request to see motion, so it starts
              // playback even when reduced motion started the animation paused.
              onRecordStart={module.animated || config.values.sweep ? () => loopRef.current?.play() : undefined}
            />
          </>
        )}
      </div>

      <div className="viewer-body">
        <div className="viewer-stage">
          <div className="canvas-wrap" ref={containerRef}>
            <canvas
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
            {ready && config.values.sweep && sweptKeys(module).includes("view") && (
              <span className="sweep-badge sweep-badge-zoom" id="sweep-badge-view">
                ⟳ sweeping zoom
              </span>
            )}
            {!ready && <p className="canvas-loading">Loading…</p>}
            {computing !== null && (
              <div className="progress" role="progressbar" aria-label="Drawing" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(computing * 100)}>
                <div className="progress-bar" style={{ width: `${Math.round(computing * 100)}%` }} />
              </div>
            )}
          </div>
          {ready && (module.animated || config.values.sweep) && (
            <PlaybackBar
              playing={playing}
              speed={speed}
              onPlay={() => loopRef.current?.play()}
              onPause={() => loopRef.current?.pause()}
              onStep={() => loopRef.current?.stepOnce()}
              onSpeed={(s) => {
                speedRef.current = s;
                setSpeed(s);
                loopRef.current?.setSpeed(s);
              }}
              onReset={module.animated ? () => instRef.current?.reset?.() : undefined}
            />
          )}
          <div className="viewer-status" aria-live="polite">
            {notice && <p className="studio-notice">{notice}</p>}
            {stats && (
              <dl className="stats">
                {Object.entries(stats).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                    <dd>{typeof v === "number" ? v.toLocaleString() : String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        <aside className="viewer-side">
          <HowItWorks text={module?.howItWorks ?? entry.summary} />
          {ready && (
            <>
              <PresetMenu presets={module.presets} activeId={config.presetId} onApply={onPreset} />
              <KnobPanel
                module={module}
                values={config.values}
                onChange={onKnobChange}
                onReset={onReset}
                sweeping={config.values.sweep ? new Set(sweptKeys(module)) : NO_KEYS}
              >
                {module.random && (
                  <SeedKnob seed={config.seed} onChange={onSeed} onRandomize={() => onSeed(randomSeed())} />
                )}
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
