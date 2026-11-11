import { KERNELS } from "./kernels.js";
import { collectTransfer } from "../core/transfer.js";

self.onmessage = (e) => {
  const { id, name, args } = e.data;
  const fn = KERNELS[name];
  if (!fn) {
    self.postMessage({ id, error: `Unknown kernel ${name}` });
    return;
  }
  try {
    const result = fn(args, (progress) => self.postMessage({ id, progress }));
    self.postMessage({ id, result }, collectTransfer(result));
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
