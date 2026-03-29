import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: "./tests/global-setup.js",
    include: ["tests/integration/**/*.test.js", "tests/unit/**/*.test.js"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: {
      REDIS_URL: "redis://localhost:6399",
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
    },
  },
});
