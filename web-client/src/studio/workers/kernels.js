// Kernels that run inside the Web Worker. Each takes (args, reportProgress).
import { escapeBand } from "../visualizations/mandelbrot/kernel.js";
import { grayScottSteps } from "../visualizations/grayScott/kernel.js";
import { dlaGrow } from "../visualizations/dla/kernel.js";

export const KERNELS = { escapeBand, grayScottSteps, dlaGrow };
