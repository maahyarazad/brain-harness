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

function makeContext(canvas) {
  const ctx = { canvas, globalAlpha: 1, lineWidth: 1, fillStyle: "#000", strokeStyle: "#000" };
  for (const name of NOOP_METHODS) {
    ctx[name] = (...args) => {
      if (name === "putImageData") {
        // Record a checksum of the pixels instead of the whole buffer
        const data = args[0].data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 7) sum = (sum + data[i] * (i % 251)) % 1e9;
        calls.push([name, sum]);
      } else if (name !== "drawImage") {
        calls.push([name, ...args.map(round)]);
      } else {
        calls.push([name]);
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
