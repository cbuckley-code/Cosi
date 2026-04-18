import { expect, vi, afterEach } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

// Suppress Cloudscape component console warnings in jsdom
vi.spyOn(console, "warn").mockImplementation(() => {});

// Ensure DOM is cleaned up between tests (required when globals: false)
afterEach(() => {
  cleanup();
});
