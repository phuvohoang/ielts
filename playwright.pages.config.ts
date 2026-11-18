import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/pages.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npm run preview -- --host 0.0.0.0',
    env: { PAGES_BASE_PATH: '/ielts/' },
    url: 'http://127.0.0.1:4173/ielts/',
  },
  projects: [
    { name: 'pages-desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'pages-mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
});
