// Manually driven animation frames, reduced-motion media query, and tab visibility.
let frameCallbacks = new Map();
let nextId = 1;

export function createFrameDriver() {
  frameCallbacks = new Map();
  return {
    raf: (cb) => {
      const id = nextId++;
      frameCallbacks.set(id, cb);
      return id;
    },
    caf: (id) => frameCallbacks.delete(id),
    advanceFrames(n = 1) {
      for (let i = 0; i < n; i++) {
        const pending = [...frameCallbacks.values()];
        frameCallbacks.clear();
        pending.forEach((cb) => cb(performance.now()));
      }
    },
    pending: () => frameCallbacks.size,
  };
}

export function stubReducedMotion(reduce) {
  window.matchMedia = (query) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
}

export function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

// --- MediaRecorder / captureStream fakes (video download tests) ---

export class FakeMediaRecorder {
  static supported = [];
  static instances = [];
  static isTypeSupported(type) {
    return FakeMediaRecorder.supported.includes(type);
  }
  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType ?? "";
    this.options = options;
    this.state = "inactive";
    this.ondataavailable = null;
    this.onstop = null;
    FakeMediaRecorder.instances.push(this);
  }
  start(timeslice) {
    this.timeslice = timeslice;
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["frame"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

/** Turns recording support on: `types` are the MIME types MediaRecorder accepts. */
export function installMediaRecorder({ types = ["video/webm;codecs=vp9", "video/webm"] } = {}) {
  FakeMediaRecorder.supported = types;
  FakeMediaRecorder.instances = [];
  globalThis.MediaRecorder = FakeMediaRecorder;
  window.MediaRecorder = FakeMediaRecorder;
  HTMLCanvasElement.prototype.captureStream = function captureStream(fps) {
    const track = { stopped: false, stop() { this.stopped = true; } };
    return { fps, tracks: [track], getTracks: () => [track] };
  };
}

/** Turns recording support off. */
export function removeMediaRecorder() {
  delete globalThis.MediaRecorder;
  delete window.MediaRecorder;
  delete HTMLCanvasElement.prototype.captureStream;
}
