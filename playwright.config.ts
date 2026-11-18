import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/pages.spec.ts",
  use: { baseURL: "http://127.0.0.1:5173" },
  webServer: {
    command: "npm run dev -- --host 0.0.0.0",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
