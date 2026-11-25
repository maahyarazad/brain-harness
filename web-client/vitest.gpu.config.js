// The GPU test project (specs/005-navier-stokes-fluid-performance/contracts/gpu-tests.md).
// Runs the real shaders in headless Chromium on software rendering (SwiftShader), so the
// exactness and stability checks do not need a physical graphics card. The jsdom suite
// (`npm test`) excludes these files and needs no browser.
//
// Chromium's automatic software-GL fallback is being phased out, so the flags below opt in
// explicitly. They are harmless on builds where the fallback still works.
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    include: ["src/__tests__/gpu/**/*.gpu.test.js"],
    // Software rendering is slow and the test files run side by side, so the 30-times-open tests can take well over a minute
    // when the whole project runs (they take about 15 s alone). A test that is really stuck still fails, just later.
    testTimeout: 180000,
    hookTimeout: 180000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader-webgl",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
          ],
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
