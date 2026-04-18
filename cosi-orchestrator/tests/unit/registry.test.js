import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { tmpdir } from "os";
import { mkdtemp, writeFile, rm, mkdir } from "fs/promises";
import path from "path";

// Mock global fetch before importing registry
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

// We need to control TOOLS_DIR. Since registry.js captures it at module load
// time, we set the env var before importing, using a temp dir that we create
// synchronously here. We'll use a unique path per test run.
const tmpBase = tmpdir();

// We'll create a fresh temp dir per test and use a module-level variable.
// Because we can't re-import the module cheaply, we set TOOLS_DIR to a path
// that we control across tests.

let tmpDir;

// We need to import the module after setting TOOLS_DIR. Since this is
// a module-level constant in registry.js, we use a fixed path trick:
// set TOOLS_DIR before the import resolves.
tmpDir = await mkdtemp(path.join(tmpBase, "cosi-registry-test-"));
process.env.TOOLS_DIR = tmpDir;

const { loadRegistry, getAllTools, getTool, getToolList, callTool } =
  await import("../../src/registry.js");

async function createToolDir(dirName, toolJson) {
  const toolPath = path.join(tmpDir, dirName);
  await mkdir(toolPath, { recursive: true });
  if (toolJson !== null) {
    await writeFile(
      path.join(toolPath, "tool.json"),
      JSON.stringify(toolJson),
      "utf8"
    );
  }
}

function makeToolJson(dirName, toolName, extraTools = []) {
  return {
    name: dirName,
    tools: [
      {
        name: toolName,
        description: `${toolName} description`,
        inputSchema: { type: "object", properties: {} },
      },
      ...extraTools,
    ],
    secrets: [],
  };
}

beforeEach(async () => {
  // Clean out tmpDir between tests
  const { readdir } = await import("fs/promises");
  let entries;
  try {
    entries = await readdir(tmpDir);
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    await rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
  vi.mocked(fetch).mockResolvedValue({ ok: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadRegistry + getAllTools", () => {
  it("returns empty registry for an empty tools dir", async () => {
    await loadRegistry();
    expect(getAllTools()).toEqual([]);
  });

  it("skips directories without tool.json", async () => {
    await createToolDir("no-manifest", null);
    await loadRegistry();
    expect(getAllTools()).toEqual([]);
  });

  it("skips non-directory entries", async () => {
    // Write a plain file in the tools dir
    await writeFile(path.join(tmpDir, "somefile.txt"), "data", "utf8");
    await loadRegistry();
    expect(getAllTools()).toEqual([]);
  });

  it("loads tools from a valid tool.json", async () => {
    await createToolDir("my-service", makeToolJson("my-service", "do_thing"));
    await loadRegistry();
    const tools = getAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].qualifiedName).toBe("my-service__do_thing");
  });

  it("qualified name is <dirName>__<toolName>", async () => {
    await createToolDir("weather-svc", makeToolJson("weather-svc", "get_forecast"));
    await loadRegistry();
    const tools = getAllTools();
    expect(tools[0].qualifiedName).toBe("weather-svc__get_forecast");
  });

  it("loads multiple tools from a single tool.json", async () => {
    const json = {
      name: "multi-svc",
      tools: [
        { name: "tool_a", description: "A", inputSchema: { type: "object", properties: {} } },
        { name: "tool_b", description: "B", inputSchema: { type: "object", properties: {} } },
      ],
      secrets: [],
    };
    await createToolDir("multi-svc", json);
    await loadRegistry();
    const tools = getAllTools();
    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.qualifiedName);
    expect(names).toContain("multi-svc__tool_a");
    expect(names).toContain("multi-svc__tool_b");
  });

  it("loads tools from multiple service directories", async () => {
    await createToolDir("svc-a", makeToolJson("svc-a", "action_a"));
    await createToolDir("svc-b", makeToolJson("svc-b", "action_b"));
    await loadRegistry();
    const tools = getAllTools();
    expect(tools).toHaveLength(2);
  });

  it("marks tools as healthy when fetch returns ok:true", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true });
    await createToolDir("healthy-svc", makeToolJson("healthy-svc", "ping"));
    await loadRegistry();
    const tools = getAllTools();
    expect(tools[0].healthy).toBe(true);
  });

  it("marks tools as unhealthy when fetch returns ok:false", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false });
    await createToolDir("down-svc", makeToolJson("down-svc", "ping"));
    await loadRegistry();
    const tools = getAllTools();
    expect(tools[0].healthy).toBe(false);
  });

  it("marks tools as unhealthy when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));
    await createToolDir("unreachable-svc", makeToolJson("unreachable-svc", "ping"));
    await loadRegistry();
    const tools = getAllTools();
    expect(tools[0].healthy).toBe(false);
  });

  it("pings the correct health URL: http://tool-<dirName>:3000/health", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true });
    await createToolDir("my-widget", makeToolJson("my-widget", "do_it"));
    await loadRegistry();
    expect(fetch).toHaveBeenCalledWith(
      "http://tool-my-widget:3000/health",
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it("sets serviceName to tool-<dirName>", async () => {
    await createToolDir("my-svc", makeToolJson("my-svc", "run"));
    await loadRegistry();
    const tools = getAllTools();
    expect(tools[0].serviceName).toBe("tool-my-svc");
  });

  it("clears old registry entries on re-load", async () => {
    await createToolDir("svc-one", makeToolJson("svc-one", "act"));
    await loadRegistry();
    expect(getAllTools()).toHaveLength(1);

    // Remove svc-one and add svc-two
    await rm(path.join(tmpDir, "svc-one"), { recursive: true });
    await createToolDir("svc-two", makeToolJson("svc-two", "act2"));
    await loadRegistry();

    const tools = getAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].qualifiedName).toBe("svc-two__act2");
  });
});

describe("getTool", () => {
  it("returns the tool entry for a known qualifiedName", async () => {
    await createToolDir("lookup-svc", makeToolJson("lookup-svc", "find_it"));
    await loadRegistry();
    const tool = getTool("lookup-svc__find_it");
    expect(tool).toBeDefined();
    expect(tool.qualifiedName).toBe("lookup-svc__find_it");
  });

  it("returns undefined for an unknown qualifiedName", async () => {
    await loadRegistry();
    expect(getTool("nonexistent__tool")).toBeUndefined();
  });

  it("returns the correct entry when multiple tools exist", async () => {
    const json = {
      name: "multi",
      tools: [
        { name: "alpha", description: "Alpha", inputSchema: { type: "object", properties: {} } },
        { name: "beta", description: "Beta", inputSchema: { type: "object", properties: {} } },
      ],
      secrets: [],
    };
    await createToolDir("multi", json);
    await loadRegistry();
    const alpha = getTool("multi__alpha");
    const beta = getTool("multi__beta");
    expect(alpha.originalName).toBe("alpha");
    expect(beta.originalName).toBe("beta");
  });
});

describe("getToolList", () => {
  it("returns an array with the public shape of each tool", async () => {
    await createToolDir(
      "shape-svc",
      makeToolJson("shape-svc", "my_action")
    );
    await loadRegistry();
    const list = getToolList();
    expect(list).toHaveLength(1);
    const item = list[0];
    expect(item).toHaveProperty("name");
    expect(item).toHaveProperty("description");
    expect(item).toHaveProperty("healthy");
    expect(item).toHaveProperty("serviceName");
    expect(item).toHaveProperty("inputSchema");
  });

  it("name field equals qualifiedName", async () => {
    await createToolDir("pub-svc", makeToolJson("pub-svc", "do_pub"));
    await loadRegistry();
    const list = getToolList();
    expect(list[0].name).toBe("pub-svc__do_pub");
  });

  it("returns [] when no tools loaded", async () => {
    await loadRegistry();
    expect(getToolList()).toEqual([]);
  });

  it("does not include internal fields like toolDir or originalName", async () => {
    await createToolDir("clean-svc", makeToolJson("clean-svc", "run"));
    await loadRegistry();
    const list = getToolList();
    expect(list[0]).not.toHaveProperty("toolDir");
    expect(list[0]).not.toHaveProperty("originalName");
    expect(list[0]).not.toHaveProperty("qualifiedName");
  });
});

describe("callTool", () => {
  it("throws 'Tool not found' for an unknown qualifiedName", async () => {
    await loadRegistry();
    await expect(callTool("unknown__tool", {})).rejects.toThrow("Tool not found");
  });

  it("error message includes the qualifiedName", async () => {
    await loadRegistry();
    await expect(callTool("missing__action", {})).rejects.toThrow("missing__action");
  });
});

afterAll(() => vi.unstubAllGlobals());
