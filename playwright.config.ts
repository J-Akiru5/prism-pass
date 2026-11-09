import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const isRemote = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "desktop",
      testMatch: /app\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testMatch: /app\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "public",
      testMatch: /public\.spec\.ts/,
    },
  ],
  webServer: isRemote
    ? undefined
    : {
        command: `pnpm start -p ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
