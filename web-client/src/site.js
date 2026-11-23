// The web client's name and description, used by the page titles and by the
// Open Graph tags written at build time (build/openGraph.js).
export const APP_NAME = "Visualization Playground";
export const AUTHOR = "Maahyar Azad";
export const APP_TITLE = `${APP_NAME} by ${AUTHOR}`;
export const APP_DESCRIPTION =
  "23 generative and algorithmic visualizations in your browser: the Mandelbrot and Julia sets, L-systems, the Game of Life, reaction–diffusion, flocking boids, sorting and maze algorithms. Tune them, animate them, save and share them.";
/** Square logo made from the Julia set's catalog picture. */
export const LOGO_PATH = "/logo.png";
/** The default preview picture for links to the site. */
export const SITE_IMAGE_PATH = "/thumbs/julia.webp";

/** The browser tab title for a page, e.g. "Julia set · Visualization Playground". */
export const pageTitle = (name) => (name ? `${name} · ${APP_NAME}` : APP_TITLE);
