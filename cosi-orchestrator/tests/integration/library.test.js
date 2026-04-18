import { describe, it, expect, beforeAll, afterEach } from "vitest";
import request from "supertest";
import fs from "fs/promises";
import path from "path";
import { createApp } from "../../src/app.js";

const TOOLS_DIR = process.env.TOOLS_DIR;

let app;

beforeAll(async () => {
  app = await createApp();
  await fs.mkdir(TOOLS_DIR, { recursive: true });
});

async function writeTool(name, manifest) {
  const dir = path.join(TOOLS_DIR, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "tool.json"), JSON.stringify(manifest, null, 2));
}

afterEach(async () => {
  try {
    const entries = await fs.readdir(TOOLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await fs.rm(path.join(TOOLS_DIR, entry.name), { recursive: true, force: true });
      }
    }
  } catch {}
});

describe("GET /api/library", () => {
  it("returns 200 with empty array when no tools exist", async () => {
    const res = await request(app).get("/api/library");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tools");
    expect(Array.isArray(res.body.tools)).toBe(true);
    expect(res.body.tools).toHaveLength(0);
  });

  it("returns both enabled and disabled tools", async () => {
    await writeTool("tool-a", {
      name: "tool-a",
      enabled: true,
      description: "Enabled tool",
      tools: [{ name: "run", description: "Run something" }],
      secrets: [],
    });
    await writeTool("tool-b", {
      name: "tool-b",
      enabled: false,
      description: "Disabled tool",
      tools: [{ name: "run", description: "Run something" }],
      secrets: [],
    });

    const res = await request(app).get("/api/library");
    expect(res.status).toBe(200);
    const names = res.body.tools.map((t) => t.name);
    expect(names).toContain("tool-a");
    expect(names).toContain("tool-b");
  });

  it("each tool entry has the expected shape", async () => {
    await writeTool("shaped-tool", {
      name: "shaped-tool",
      enabled: false,
      description: "A test tool",
      tools: [{ name: "my_tool", description: "Does something" }],
      secrets: ["shaped/secret"],
    });

    const res = await request(app).get("/api/library");
    const tool = res.body.tools.find((t) => t.name === "shaped-tool");
    expect(tool).toBeDefined();
    expect(tool).toHaveProperty("name", "shaped-tool");
    expect(tool).toHaveProperty("enabled", false);
    expect(tool).toHaveProperty("description", "A test tool");
    expect(Array.isArray(tool.tools)).toBe(true);
    expect(tool.tools[0]).toHaveProperty("name", "my_tool");
    expect(Array.isArray(tool.secrets)).toBe(true);
    expect(tool.secrets).toContain("shaped/secret");
  });

  it("treats missing enabled field as enabled: true", async () => {
    await writeTool("no-enabled-field", {
      name: "no-enabled-field",
      description: "No enabled field",
      tools: [],
      secrets: [],
    });

    const res = await request(app).get("/api/library");
    const tool = res.body.tools.find((t) => t.name === "no-enabled-field");
    expect(tool).toBeDefined();
    expect(tool.enabled).toBe(true);
  });

  it("skips directories without a valid tool.json", async () => {
    const dir = path.join(TOOLS_DIR, "no-manifest");
    await fs.mkdir(dir, { recursive: true });

    const res = await request(app).get("/api/library");
    const names = res.body.tools.map((t) => t.name);
    expect(names).not.toContain("no-manifest");
  });
});

describe("POST /api/library/:name/enable", () => {
  it("sets enabled: true in tool.json", async () => {
    await writeTool("toggle-tool", {
      name: "toggle-tool",
      enabled: false,
      tools: [],
      secrets: [],
    });

    const res = await request(app).post("/api/library/toggle-tool/enable");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const raw = await fs.readFile(
      path.join(TOOLS_DIR, "toggle-tool", "tool.json"),
      "utf8"
    );
    expect(JSON.parse(raw).enabled).toBe(true);
  });

  it("returns 404 for a non-existent tool", async () => {
    const res = await request(app).post("/api/library/non-existent/enable");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/library/:name/disable", () => {
  it("sets enabled: false in tool.json", async () => {
    await writeTool("active-tool", {
      name: "active-tool",
      enabled: true,
      tools: [],
      secrets: [],
    });

    const res = await request(app).post("/api/library/active-tool/disable");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const raw = await fs.readFile(
      path.join(TOOLS_DIR, "active-tool", "tool.json"),
      "utf8"
    );
    expect(JSON.parse(raw).enabled).toBe(false);
  });

  it("returns 404 for a non-existent tool", async () => {
    const res = await request(app).post("/api/library/non-existent/disable");
    expect(res.status).toBe(404);
  });

  it("enable/disable round-trip preserves other manifest fields", async () => {
    await writeTool("round-trip", {
      name: "round-trip",
      enabled: true,
      description: "preserved",
      tools: [{ name: "go" }],
      secrets: ["rt/key"],
    });

    await request(app).post("/api/library/round-trip/disable");
    await request(app).post("/api/library/round-trip/enable");

    const raw = await fs.readFile(
      path.join(TOOLS_DIR, "round-trip", "tool.json"),
      "utf8"
    );
    const manifest = JSON.parse(raw);
    expect(manifest.enabled).toBe(true);
    expect(manifest.description).toBe("preserved");
    expect(manifest.secrets).toEqual(["rt/key"]);
  });
});
