import { useCallback, useEffect, useRef, useState } from "react";
import { validateConfig, defaultsOf, applyPreset, describeReplaced } from "../core/knobs.js";
import { createModuleContext } from "../core/moduleContext.js";
import { createLoop } from "../core/loop.js";
import { randomSeed } from "../core/rng.js";
import { decodeConfig } from "../core/shareLink.js";
import { prefersReducedMotion } from "../core/reducedMotion.js";
import KnobPanel from "./KnobPanel.jsx";
import SeedKnob from "./knobs/SeedKnob.jsx";
import PresetMenu from "./PresetMenu.jsx";
import PlaybackBar from "./PlaybackBar.jsx";
import HowItWorks from "./HowItWorks.jsx";
import ShareMenu from "./ShareMenu.jsx";
import SaveDialog from "./SaveDialog.jsx";

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
      if (m.animated) {
        loopRef.current = createLoop({
          step: () => instRef.current?.step(),
          render: () => instRef.current?.render(),
          baseSteps: stepsFor(m, cfg.values),
          onStateChange: setPlaying,
        });
        loopRef.current.setSpeed(speedRef.current);
        if (activeRef.current && !prefersReducedMotion(motionRef.current)) loopRef.current.play();
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
    if (p) restartWith({ ...configRef.current, values: p.values, input: p.input, presetId: id, view: module.defaultView ? { ...module.defaultView } : null });
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
    return instRef.current.pointer({ type, ...p, button: e?.button ?? 0, shiftKey: Boolean(e?.shiftKey), ...extra });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !module?.interactive) return;
    const onWheel = (e) => {
      if (send("wheel", e, { deltaY: e.deltaY }) !== undefined || module.id === "mandelbrot" || module.id === "julia") e.preventDefault();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  function onKeyDown(e) {
    if (send("key", null, { key: e.key }) === true) {
      e.preventDefault();
      return;
    }
    if (!module.animated) return;
    if (e.key === " ") {
      e.preventDefault();
      loopRef.current?.isPlaying() ? loopRef.current.pause() : loopRef.current?.play();
    } else if (e.key === ".") {
      loopRef.current?.stepOnce();
    } else if (e.key === "r" || e.key === "R") {
      instRef.current?.reset();
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
            <ShareMenu module={module} config={config} canvasRef={canvasRef} vizId={entry.id} name={saved?.name ?? entry.name} />
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
              onPointerDown={(e) => {
                if (module?.interactive) e.currentTarget.setPointerCapture?.(e.pointerId);
                send("down", e);
              }}
              onPointerMove={(e) => send("move", e)}
              onPointerUp={(e) => send("up", e)}
              onPointerLeave={(e) => send("leave", e)}
              onDoubleClick={(e) => send("dblclick", e)}
              onContextMenu={(e) => module?.interactive && e.preventDefault()}
              onKeyDown={onKeyDown}
            />
            {!ready && <p className="canvas-loading">Loading…</p>}
            {computing !== null && (
              <div className="progress" role="progressbar" aria-label="Drawing" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(computing * 100)}>
                <div className="progress-bar" style={{ width: `${Math.round(computing * 100)}%` }} />
              </div>
            )}
          </div>
          {ready && module.animated && (
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
              onReset={() => instRef.current?.reset()}
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
              <KnobPanel module={module} values={config.values} onChange={onKnobChange} onReset={onReset}>
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
