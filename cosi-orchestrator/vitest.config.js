import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: "./tests/global-setup.js",
    include: ["tests/integration/**/*.test.js"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run test files sequentially — integration tests share Redis state
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    env: {
      REDIS_URL: "redis://localhost:6399",
      TOOLS_DIR: "/tmp/cosi-test-tools",
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
      BEDROCK_MODEL_ID: "test-model",
    },
  },
});
