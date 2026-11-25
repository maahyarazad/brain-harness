// The twelve existing animated visualizations that run on the graphics card (feature 005, Story 5), for the tests
// that treat them all the same way.
import life from "../../studio/visualizations/life/index.js";
import elementaryCA from "../../studio/visualizations/elementaryCA/index.js";
import langton from "../../studio/visualizations/langton/index.js";
import recaman from "../../studio/visualizations/recaman/index.js";
import sorting from "../../studio/visualizations/sorting/index.js";
import maze from "../../studio/visualizations/maze/index.js";
import grayScott from "../../studio/visualizations/grayScott/index.js";
import boids from "../../studio/visualizations/boids/index.js";
import lorenz from "../../studio/visualizations/lorenz/index.js";
import doublePendulum from "../../studio/visualizations/doublePendulum/index.js";
import fourier from "../../studio/visualizations/fourier/index.js";
import timesTable from "../../studio/visualizations/timesTable/index.js";
import { withSweep } from "../../studio/core/sweep.js";

export const PORTS = [
  ["Game of Life", life],
  ["Elementary cellular automaton", elementaryCA],
  ["Langton's ant", langton],
  ["Recamán's sequence", recaman],
  ["Sorting algorithms", sorting],
  ["Maze", maze],
  ["Reaction–diffusion", grayScott],
  ["Boids", boids],
  ["Lorenz attractor", lorenz],
  ["Double pendulum", doublePendulum],
  ["Fourier epicycles", fourier],
  ["Times-table circle", timesTable],
].map(([name, mod]) => [name, withSweep(mod)]);
