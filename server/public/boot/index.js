// Entry of the loading screen. The server puts it in every page it sends (src/site/page.js),
// before the app's own scripts, so the screen starts before the app's code has downloaded.
// It is plain browser JavaScript, served as it is (no build step).
import { startLoader } from "./loader.js";

const WASM_URL = "/boot/dotlottie-player.wasm"; // served by this server, not a CDN

startLoader({ assets: window.__BOOT_ASSETS__ ?? [] });

// The Tetris animation. If anything about it fails, the percentage is still there.
const box = document.getElementById("boot-anim");
if (box) {
  import("./dotlottie-wc.js") // the player, vendored from @lottiefiles/dotlottie-wc (see public/boot/README.md)
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
