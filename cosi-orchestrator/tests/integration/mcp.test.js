import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createServer } from "http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../../src/app.js";

vi.mock("../../src/registry.js", () => ({
  loadRegistry: vi.fn(async () => {}),
  getAllTools: vi.fn(() => []),
  getToolList: vi.fn(() => []),
  callTool: vi.fn(async () => ({
    content: [{ type: "text", text: "tool result" }],
  })),
}));

// Lazy import so tests can swap the mock values before the module is used
const registry = await import("../../src/registry.js");

let app;

beforeAll(async () => {
  app = await createApp();
});

/**
 * Start the Express app on a random port, yield the port to `fn`, then close.
 * Using a real TCP server lets the MCP SDK client transport work correctly.
 */
async function withServer(fn) {
  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  try {
    return await fn(port);
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
  }
}

/**
 * Connect a fresh MCP SDK client to the server at `port`, run `fn(client)`,
 * then close the client connection.
 */
async function withClient(port, fn) {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`)
  );
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

// Raw-text parser — bypasses supertest's automatic JSON parsing so we can
// inspect the exact response body from the MCP transport.
function rawParser(res, callback) {
  let data = "";
  res.setEncoding("utf8");
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => callback(null, data));
}

// Parse the JSON-RPC response out of a raw MCP response body.
// In stateless mode the transport returns either a single JSON object or
// newline-delimited JSON objects; we look for the one with id + result/error.
function parseMcpBody(raw) {
  for (const line of raw.trim().split("\n")) {
    try {
      const obj = JSON.parse(line);
      if (obj.jsonrpc && (obj.result !== undefined || obj.error !== undefined)) {
        return obj;
      }
    } catch {
      // not a JSON line
    }
  }
  return null;
}

// ─── Basic HTTP layer ──────────────────────────────────────────────────────────

describe("GET /mcp", () => {
  it("returns 405 (tells the SDK client there is no SSE endpoint)", async () => {
    const res = await request(app).get("/mcp");
    expect(res.status).toBe(405);
  });
});

describe("POST /mcp — initialize", () => {
  it("returns 200", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      })
      .parse(rawParser);

    expect(res.status).toBe(200);
  });

  it("response body identifies the server as cosi-orchestrator", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      })
      .parse(rawParser);

    const body = parseMcpBody(res.text);
    expect(body).not.toBeNull();
    expect(body.result.serverInfo.name).toBe("cosi-orchestrator");
    expect(body.result.serverInfo.version).toBe("1.0.0");
  });

  it("consecutive initialize requests both succeed (fresh server per request)", async () => {
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    };

    const [r1, r2] = await Promise.all([
      request(app).post("/mcp").set("Content-Type", "application/json").send(payload).parse(rawParser),
      request(app).post("/mcp").set("Content-Type", "application/json").send(payload).parse(rawParser),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});

// ─── MCP protocol — full client flow ──────────────────────────────────────────

describe("MCP tools/list", () => {
  it("returns an empty list when no tools are registered", async () => {
    vi.mocked(registry.getAllTools).mockReturnValue([]);

    await withServer(async (port) => {
      await withClient(port, async (client) => {
        const { tools } = await client.listTools();
        expect(tools).toEqual([]);
      });
    });
  });

  it("returns the registered tools with name and description", async () => {
    vi.mocked(registry.getAllTools).mockReturnValue([
      {
        qualifiedName: "my-service__do_thing",
        description: "Does the thing",
        inputSchema: {
          type: "object",
          properties: { input: { type: "string", description: "some input" } },
          required: ["input"],
        },
      },
    ]);

    await withServer(async (port) => {
      await withClient(port, async (client) => {
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe("my-service__do_thing");
        expect(tools[0].description).toBe("Does the thing");
        expect(tools[0].inputSchema.properties).toHaveProperty("input");
      });
    });

    vi.mocked(registry.getAllTools).mockReturnValue([]);
  });
});

describe("MCP tools/call", () => {
  beforeAll(() => {
    vi.mocked(registry.getAllTools).mockReturnValue([
      {
        qualifiedName: "my-service__do_thing",
        description: "Does the thing",
        inputSchema: {
          type: "object",
          properties: { input: { type: "string" } },
          required: ["input"],
        },
      },
    ]);
  });

  it("calls the underlying tool and returns its content", async () => {
    vi.mocked(registry.callTool).mockResolvedValue({
      content: [{ type: "text", text: "hello from tool" }],
    });

    await withServer(async (port) => {
      await withClient(port, async (client) => {
        const result = await client.callTool({
          name: "my-service__do_thing",
          arguments: { input: "test" },
        });
        expect(result.content).toEqual([{ type: "text", text: "hello from tool" }]);
        expect(result.isError).toBeFalsy();
      });
    });
  });

  it("returns isError: true when the tool throws", async () => {
    vi.mocked(registry.callTool).mockRejectedValue(new Error("upstream failure"));

    await withServer(async (port) => {
      await withClient(port, async (client) => {
        const result = await client.callTool({
          name: "my-service__do_thing",
          arguments: { input: "test" },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("upstream failure");
      });
    });
  });
});
