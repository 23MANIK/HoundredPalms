import { defineConfig, devices } from "@playwright/test";
import { bypassHeaders } from "./e2e/helpers";

/**
 * End-to-end checks that click through the app like a guest and the staff do.
 *
 * - Local / CI: leave E2E_BASE_URL unset. Playwright starts `npm run start`
 *   (build first) against the database in DATABASE_URL.
 * - Live site or a preview: set E2E_BASE_URL plus E2E_STAFF_PHONE and
 *   E2E_STAFF_PIN for a manager login.
 */
const remote = process.env.E2E_BASE_URL?.replace(/\/$/, "");
const baseURL = remote ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Both projects share one table on the live site, so run one test at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL,
    extraHTTPHeaders: bypassHeaders(),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
  ],
  webServer: remote
    ? undefined
    : {
        command: "npm run start",
        url: `${baseURL}/staff/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
