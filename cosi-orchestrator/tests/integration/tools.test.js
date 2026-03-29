import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

let app;

beforeAll(async () => {
  app = await createApp();
});

describe("GET /api/tools", () => {
  it("returns 200 with an empty tools array when no tools are installed", async () => {
    const res = await request(app).get("/api/tools");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tools");
    expect(Array.isArray(res.body.tools)).toBe(true);
  });

  it("each tool entry has the expected shape", async () => {
    const res = await request(app).get("/api/tools");
    for (const tool of res.body.tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("healthy");
      expect(tool).toHaveProperty("serviceName");
    }
  });
});

describe("GET /api/tools/:name/logs", () => {
  it("returns log placeholder for any tool name", async () => {
    const res = await request(app).get("/api/tools/my-tool/logs");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tool", "my-tool");
    expect(Array.isArray(res.body.logs)).toBe(true);
  });
});
