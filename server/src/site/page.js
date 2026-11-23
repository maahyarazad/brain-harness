// The HTML pages the server sends: the client's built page with the loading screen put in.
// The loading screen is shown from the first byte, before any of the app's code has downloaded,
// and shows the percentage of the first screen's assets loaded (public/boot/).

export const LOADER_STYLE = `<style>
      #boot-loader {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: #f7f7f5;
        color: #1d1d1b;
        transition: opacity 0.3s;
      }
      #boot-anim {
        width: 100px;
        height: 100px;
        max-width: 100px;
        max-height: 100px;
      }
      #boot-anim dotlottie-wc {
        display: block;
        width: 100px;
        height: 100px;
        max-width: 100px;
        max-height: 100px;
      }
      #boot-percent {
        font: 14px system-ui, sans-serif;
        font-variant-numeric: tabular-nums;
      }
      .boot-loader--done {
        opacity: 0;
        pointer-events: none;
      }
      @media (prefers-color-scheme: dark) {
        #boot-loader {
          background: #161615;
          color: #ececea;
        }
      }
    </style>`;

export const LOADER_MARKUP = `<div id="boot-loader" role="status" aria-live="polite" aria-label="Loading">
      <div id="boot-anim"></div>
      <span id="boot-percent">0%</span>
    </div>`;

const MODULE_SCRIPT = '<script type="module"';

/** `<`-safe JSON for an inline script. */
const inlineJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * The client's page (`shell`) with the loading screen added: its styles in <head>, its markup
 * at the start of <body>, and its scripts (the list of first-screen assets, then /boot/index.js)
 * before the app's own module scripts.
 */
export function renderPage(shell, assets = []) {
  let html = shell;
  html = html.includes("</head>") ? html.replace("</head>", `  ${LOADER_STYLE}\n  </head>`) : LOADER_STYLE + html;
  html = /<body[^>]*>/.test(html) ? html.replace(/<body[^>]*>/, (m) => `${m}\n    ${LOADER_MARKUP}`) : LOADER_MARKUP + html;
  const scripts =
    (assets.length ? `<script>window.__BOOT_ASSETS__=${inlineJson(assets)}</script>\n    ` : "") +
    `<script type="module" src="/boot/index.js"></script>\n    `;
  const i = html.indexOf(MODULE_SCRIPT);
  return i < 0 ? html.replace("</body>", `${scripts}</body>`) : html.slice(0, i) + scripts + html.slice(i);
}
