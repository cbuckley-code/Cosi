import { defineConfig } from "vitest/config";

// Unit tests — no Redis or Docker required.
// Run with: npm run test:unit
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.js"],
    testTimeout: 15000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    env: {
      TOOLS_DIR: "/tmp/cosi-test-tools",
      SECRETS_PATH: "/tmp/cosi-test-secrets.env",
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
    },
  },
});
