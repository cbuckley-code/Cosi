import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { getLibrary, loadRegistry, getToolList } from "../../src/registry.js";

const TOOLS_DIR = process.env.TOOLS_DIR;

async function writeTool(name, manifest) {
  const dir = path.join(TOOLS_DIR, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "tool.json"), JSON.stringify(manifest, null, 2));
}

beforeEach(async () => {
  await fs.mkdir(TOOLS_DIR, { recursive: true });
});

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

describe("getLibrary()", () => {
  it("returns an empty array when TOOLS_DIR is empty", async () => {
    const result = await getLibrary();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("includes tools with enabled: false", async () => {
    await writeTool("disabled-tool", {
      name: "disabled-tool",
      enabled: false,
      description: "Disabled",
      tools: [],
      secrets: [],
    });

    const result = await getLibrary();
    expect(result.find((t) => t.name === "disabled-tool")).toBeDefined();
  });

  it("includes tools with enabled: true", async () => {
    await writeTool("enabled-tool", {
      name: "enabled-tool",
      enabled: true,
      description: "Enabled",
      tools: [],
      secrets: [],
    });

    const result = await getLibrary();
    expect(result.find((t) => t.name === "enabled-tool")).toBeDefined();
  });

  it("treats missing enabled field as true", async () => {
    await writeTool("implicit", {
      name: "implicit",
      tools: [],
      secrets: [],
    });

    const result = await getLibrary();
    const tool = result.find((t) => t.name === "implicit");
    expect(tool).toBeDefined();
    expect(tool.enabled).toBe(true);
  });

  it("returns correct shape for each entry", async () => {
    await writeTool("full-tool", {
      name: "full-tool",
      enabled: false,
      description: "Full test tool",
      tools: [{ name: "do_thing", description: "Does the thing" }],
      secrets: ["full/key", "full/token"],
    });

    const result = await getLibrary();
    const tool = result.find((t) => t.name === "full-tool");

    expect(tool).toMatchObject({
      name: "full-tool",
      enabled: false,
      description: "Full test tool",
    });
    expect(tool.tools).toHaveLength(1);
    expect(tool.tools[0]).toMatchObject({ name: "do_thing", description: "Does the thing" });
    expect(tool.secrets).toEqual(["full/key", "full/token"]);
  });

  it("skips directories without a tool.json", async () => {
    await fs.mkdir(path.join(TOOLS_DIR, "no-manifest"), { recursive: true });

    const result = await getLibrary();
    expect(result.find((t) => t.name === "no-manifest")).toBeUndefined();
  });

  it("skips directories with malformed tool.json", async () => {
    const dir = path.join(TOOLS_DIR, "bad-json");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "tool.json"), "{ not valid json");

    const result = await getLibrary();
    expect(result.find((t) => t.name === "bad-json")).toBeUndefined();
  });

  it("returns all tools when mix of enabled and disabled", async () => {
    await writeTool("alpha", { name: "alpha", enabled: true, tools: [], secrets: [] });
    await writeTool("beta", { name: "beta", enabled: false, tools: [], secrets: [] });
    await writeTool("gamma", { name: "gamma", tools: [], secrets: [] });

    const result = await getLibrary();
    const names = result.map((t) => t.name);
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
    expect(names).toContain("gamma");
    expect(result).toHaveLength(3);
  });
});

describe("loadRegistry() enabled filtering", () => {
  it("omits disabled tools from the active registry", async () => {
    await writeTool("active", {
      name: "active",
      enabled: true,
      tools: [{ name: "run", description: "Run" }],
      secrets: [],
    });
    await writeTool("dormant", {
      name: "dormant",
      enabled: false,
      tools: [{ name: "run", description: "Run" }],
      secrets: [],
    });

    await loadRegistry();
    const tools = getToolList();
    const names = tools.map((t) => t.serviceName);

    expect(names).toContain("tool-active");
    expect(names).not.toContain("tool-dormant");
  });

  it("includes tools with no enabled field in the active registry", async () => {
    await writeTool("implicit-active", {
      name: "implicit-active",
      tools: [{ name: "go", description: "Go" }],
      secrets: [],
    });

    await loadRegistry();
    const tools = getToolList();
    const names = tools.map((t) => t.serviceName);
    expect(names).toContain("tool-implicit-active");
  });
});
