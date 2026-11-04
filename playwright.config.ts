import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./client/e2e",
  workers: 1,
  timeout: 15_000,
  outputDir: "./server/.temporary/playwright",
  use: { baseURL: "http://127.0.0.1:3100" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command:
      "node client/node_modules/serve/build/main.js client/out --listen 3100 --no-clipboard",
    url: "http://127.0.0.1:3100",
    timeout: 120_000,
  },
});
