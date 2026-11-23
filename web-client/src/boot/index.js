// Entry of the loading screen: the first script index.html loads. It is separate from
// main.jsx so the screen starts before the app's code has downloaded.
import { startLoader } from "./loader.js";

const WASM_URL = "/dotlottie-player.wasm"; // served from this site, not a CDN

startLoader({ assets: window.__BOOT_ASSETS__ ?? [] });

// The Tetris animation. If anything about it fails, the percentage is still there.
const box = document.getElementById("boot-anim");
if (box) {
  import("@lottiefiles/dotlottie-wc")
    .then(({ setWasmUrl }) => {
      setWasmUrl(WASM_URL); // before the element exists, so the player never asks a CDN
      const player = document.createElement("dotlottie-wc");
      player.setAttribute("src", "/tetris-loop.lottie");
      player.setAttribute("loop", "");
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) player.setAttribute("autoplay", "");
      box.appendChild(player);
    })
    .catch(() => {});
}
