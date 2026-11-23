# Loading screen files (served at /boot/ and /tetris-loop.lottie)

The server puts the Tetris loading screen into every page it sends (`src/site/page.js`).

- `index.js`, `loader.js`, `progress.js`: the loading screen's own code (plain browser JavaScript).
- `dotlottie-wc.js`: the Lottie player, copied from `@lottiefiles/dotlottie-wc@0.12.2` (`dist/dotlottie-wc.js`, a standalone file).
- `dotlottie-player.wasm`: its WebAssembly renderer, copied from `@lottiefiles/dotlottie-web@0.83.2` (`dist/dotlottie-player.wasm`). The player is told to load it from here, never from a CDN.
- `../tetris-loop.lottie`: the animation.

To update the player, copy both files from the matching npm packages and keep these versions in step.
