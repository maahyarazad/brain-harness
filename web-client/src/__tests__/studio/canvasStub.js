// A fake 2D canvas context for jsdom, which has no canvas implementation.
// Every drawing call is recorded so tests can compare two renders.
export const calls = [];

const NOOP_METHODS = [
  "fillRect", "strokeRect", "clearRect", "beginPath", "closePath", "moveTo", "lineTo",
  "arc", "ellipse", "quadraticCurveTo", "bezierCurveTo", "rect", "stroke", "fill",
  "putImageData", "drawImage", "save", "restore", "translate", "scale", "rotate",
  "setTransform", "resetTransform", "fillText", "strokeText", "setLineDash", "clip",
];

function round(v) {
  return typeof v === "number" ? Math.round(v * 1000) / 1000 : v;
}

function checksum(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i += 7) sum = (sum + data[i] * (i % 251)) % 1e9;
  return sum;
}

/**
 * Besides the global `calls` list, each context keeps `ctx.log`: a per-canvas
 * list of richer records so tests can tell drawing steps apart:
 * - { op: "drawImage", source: "canvas" | "other", dest: [x, y, w, h] }
 * - { op: "putImageData", width, height, x, y }
 * - { op: "imageSmoothingEnabled", value }
 * - { op: <other method name>, args }
 */
function makeContext(canvas) {
  const log = [];
  let smoothing = true;
  const ctx = {
    canvas,
    log,
    globalAlpha: 1,
    lineWidth: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
    get imageSmoothingEnabled() {
      return smoothing;
    },
    set imageSmoothingEnabled(v) {
      smoothing = Boolean(v);
      log.push({ op: "imageSmoothingEnabled", value: smoothing });
    },
  };
  for (const name of NOOP_METHODS) {
    ctx[name] = (...args) => {
      if (name === "putImageData") {
        // Record a checksum of the pixels instead of the whole buffer
        const img = args[0];
        calls.push([name, checksum(img.data)]);
        log.push({ op: name, width: img.width, height: img.height, x: args[1], y: args[2] });
      } else if (name === "drawImage") {
        const [src, ...rest] = args;
        const source = src instanceof HTMLCanvasElement ? "canvas" : "other";
        // drawImage(src, dx, dy) | (src, dx, dy, dw, dh) | (src, sx, sy, sw, sh, dx, dy, dw, dh)
        let dest;
        if (rest.length >= 8) dest = rest.slice(4, 8);
        else if (rest.length >= 4) dest = rest.slice(0, 4);
        else dest = [rest[0], rest[1], src?.width, src?.height];
        calls.push([name]);
        log.push({ op: name, source, dest: dest.map(round) });
      } else {
        calls.push([name, ...args.map(round)]);
        log.push({ op: name, args: args.map(round) });
      }
    };
  }
  ctx.createImageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  ctx.getImageData = (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  ctx.measureText = (t) => ({ width: String(t).length * 6 });
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  return ctx;
}

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export function installCanvasStub() {
  const proto = HTMLCanvasElement.prototype;
  proto.getContext = function () {
    if (!this.__ctx) this.__ctx = makeContext(this);
    return this.__ctx;
  };
  proto.toDataURL = () => TINY_PNG;
  proto.toBlob = function (cb) {
    cb(new Blob(["png"], { type: "image/png" }));
  };
}

export function resetCanvasCalls() {
  calls.length = 0;
}
