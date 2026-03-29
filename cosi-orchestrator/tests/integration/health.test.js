import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

let app;

beforeAll(async () => {
  app = await createApp();
});

describe("GET /health", () => {
  it("returns 200 with service status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "cosi-orchestrator" });
  });
});
