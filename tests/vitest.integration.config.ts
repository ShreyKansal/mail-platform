import { defineConfig } from 'vitest/config';

// Integration, SMTP and security suites run against the docker-compose stack
// (`pnpm dev:infra`) and the mail_platform_test database. They share Postfix,
// the bounce port and the test database, so files run sequentially.
export default defineConfig({
  test: {
    include: ['integration/**/*.test.ts', 'smtp/**/*.test.ts', 'security/**/*.test.ts'],
    globalSetup: ['./support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
});
