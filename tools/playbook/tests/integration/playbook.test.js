import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";

// Bedrock is mocked before any imports that trigger module evaluation.
// The mock returns deterministic unit-vector embeddings keyed by input text,
// so cosine-similarity results are predictable in tests.
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn(() => ({ send: vi.fn() })),
  InvokeModelCommand: vi.fn((input) => input),
}));

import * as BedrockMod from "@aws-sdk/client-bedrock-runtime";
import Redis from "ioredis";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, cosineSimilarity } from "../../index.js";

// ---------------------------------------------------------------------------
// Embedding helpers
// ---------------------------------------------------------------------------

/** Build a 1024-dim unit vector with 1.0 at position `idx`. */
function makeVec(idx) {
  return new Array(1024).fill(0).map((_, i) => (i === idx ? 1.0 : 0.0));
}

// Each unique text string maps to its own orthogonal dimension so that
// cosine_similarity(embed(A), embed(A)) === 1 and
// cosine_similarity(embed(A), embed(B)) === 0 for A ≠ B.
const TEXT_EMBEDDINGS = {
  // Entries stored in add_playbook_entry
  "Pagination Best Practices\nAlways use cursor-based pagination for large result sets": makeVec(0),
  "Auth Token Handling\nCache tokens and refresh proactively before expiry": makeVec(1),
  // Search queries
  "cursor pagination large results": makeVec(0), // identical to pagination entry → score 1.0
  "token expiry refresh": makeVec(1),             // identical to auth entry → score 1.0
  "something completely unrelated": makeVec(9),   // orthogonal to both
};

function bedrockSend(cmd) {
  const { inputText } = JSON.parse(cmd.body);
  const embedding = TEXT_EMBEDDINGS[inputText] ?? makeVec(99);
  return Promise.resolve({
    body: new TextEncoder().encode(JSON.stringify({ embedding })),
  });
}

// ---------------------------------------------------------------------------
// Server + Redis setup
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6399";
const redis = new Redis(REDIS_URL);

let httpServer;
let serverPort;

beforeAll(async () => {
  const app = createApp();

  // Wire up the Bedrock mock — createApp() already called new BedrockRuntimeClient()
  const bedrockInstance =
    vi.mocked(BedrockMod.BedrockRuntimeClient).mock.results[0].value;
  vi.mocked(bedrockInstance.send).mockImplementation(bedrockSend);

  await new Promise((resolve, reject) => {
    httpServer = app.listen(0, (err) => (err ? reject(err) : resolve()));
  });
  serverPort = httpServer.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  await redis.quit();
});

afterEach(async () => {
  // Remove every playbook entry written during the test
  const ids = await redis.smembers("playbook:entries");
  if (ids.length > 0) {
    const pipeline = redis.pipeline();
    for (const id of ids) pipeline.del(`playbook:entry:${id}`);
    pipeline.del("playbook:entries");
    await pipeline.exec();
  }
});

// ---------------------------------------------------------------------------
// MCP client helper
// ---------------------------------------------------------------------------

async function callTool(name, args) {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${serverPort}/mcp`)
  );
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(result.content[0].text);
    return JSON.parse(result.content[0].text);
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", tool: "playbook" });
  });
});

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical unit vectors", () => {
    const a = makeVec(0);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal unit vectors", () => {
    expect(cosineSimilarity(makeVec(0), makeVec(1))).toBeCloseTo(0.0);
  });

  it("returns 0.0 when either vector is all-zeros", () => {
    const zero = new Array(1024).fill(0);
    expect(cosineSimilarity(makeVec(0), zero)).toBe(0);
  });
});

describe("add_playbook_entry", () => {
  it("returns the entry id, title, toolName, and tags", async () => {
    const result = await callTool("add_playbook_entry", {
      toolName: "github-issues",
      title: "Pagination Best Practices",
      content:
        "Always use cursor-based pagination for large result sets",
      tags: ["pagination"],
    });

    expect(typeof result.id).toBe("string");
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(result.title).toBe("Pagination Best Practices");
    expect(result.toolName).toBe("github-issues");
    expect(result.tags).toEqual(["pagination"]);
  });

  it("persists the entry in Redis", async () => {
    const result = await callTool("add_playbook_entry", {
      toolName: "github-issues",
      title: "Pagination Best Practices",
      content:
        "Always use cursor-based pagination for large result sets",
    });

    const raw = await redis.get(`playbook:entry:${result.id}`);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw);
    expect(stored.id).toBe(result.id);
    expect(stored.toolName).toBe("github-issues");
    expect(stored.title).toBe("Pagination Best Practices");
    expect(Array.isArray(stored.embedding)).toBe(true);
    expect(stored.embedding).toHaveLength(1024);
  });

  it("defaults tags to an empty array when not provided", async () => {
    const result = await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Auth Token Handling",
      content: "Cache tokens and refresh proactively before expiry",
    });
    expect(result.tags).toEqual([]);
  });
});

describe("list_playbook_entries", () => {
  it("returns an empty array when no entries exist", async () => {
    const result = await callTool("list_playbook_entries", {});
    expect(result).toEqual([]);
  });

  it("lists all stored entries without embedding vectors", async () => {
    await callTool("add_playbook_entry", {
      toolName: "github-issues",
      title: "Pagination Best Practices",
      content: "Always use cursor-based pagination for large result sets",
    });
    await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Auth Token Handling",
      content: "Cache tokens and refresh proactively before expiry",
    });

    const entries = await callTool("list_playbook_entries", {});
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e).not.toHaveProperty("embedding");
      expect(e).toHaveProperty("id");
      expect(e).toHaveProperty("title");
      expect(e).toHaveProperty("createdAt");
    }
  });

  it("filters entries by toolName", async () => {
    await callTool("add_playbook_entry", {
      toolName: "github-issues",
      title: "Pagination Best Practices",
      content: "Always use cursor-based pagination for large result sets",
    });
    await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Auth Token Handling",
      content: "Cache tokens and refresh proactively before expiry",
    });

    const entries = await callTool("list_playbook_entries", {
      toolName: "github-issues",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].toolName).toBe("github-issues");
  });
});

describe("search_playbook", () => {
  it("returns an empty array when no entries exist", async () => {
    const results = await callTool("search_playbook", {
      query: "cursor pagination large results",
    });
    expect(results).toEqual([]);
  });

  it("returns the most semantically similar entry first", async () => {
    await callTool("add_playbook_entry", {
      toolName: "github-issues",
      title: "Pagination Best Practices",
      content: "Always use cursor-based pagination for large result sets",
    });
    await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Auth Token Handling",
      content: "Cache tokens and refresh proactively before expiry",
    });

    // Query embedding matches the pagination entry
    const results = await callTool("search_playbook", {
      query: "cursor pagination large results",
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("Pagination Best Practices");
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it("ranks auth entry first when query matches auth embedding", async () => {
    await callTool("add_playbook_entry", {
      toolName: "github-issues",
      title: "Pagination Best Practices",
      content: "Always use cursor-based pagination for large result sets",
    });
    await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Auth Token Handling",
      content: "Cache tokens and refresh proactively before expiry",
    });

    const results = await callTool("search_playbook", {
      query: "token expiry refresh",
    });

    expect(results[0].title).toBe("Auth Token Handling");
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it("respects topK limit", async () => {
    await callTool("add_playbook_entry", {
      toolName: "github-issues",
      title: "Pagination Best Practices",
      content: "Always use cursor-based pagination for large result sets",
    });
    await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Auth Token Handling",
      content: "Cache tokens and refresh proactively before expiry",
    });

    const results = await callTool("search_playbook", {
      query: "cursor pagination large results",
      topK: 1,
    });

    expect(results).toHaveLength(1);
  });

  it("filters by toolName but always includes 'general' entries", async () => {
    await callTool("add_playbook_entry", {
      toolName: "github-issues",
      title: "Pagination Best Practices",
      content: "Always use cursor-based pagination for large result sets",
    });
    await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Auth Token Handling",
      content: "Cache tokens and refresh proactively before expiry",
    });

    // Filter to "jira" — should only see general entries, not github-issues
    const results = await callTool("search_playbook", {
      query: "cursor pagination large results",
      toolName: "jira",
    });

    expect(results.every((e) => e.toolName === "general")).toBe(true);
  });

  it("strips embedding vectors from results", async () => {
    await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Pagination Best Practices",
      content: "Always use cursor-based pagination for large result sets",
    });

    const results = await callTool("search_playbook", {
      query: "cursor pagination large results",
    });
    expect(results[0]).not.toHaveProperty("embedding");
    expect(results[0]).toHaveProperty("score");
  });
});

describe("delete_playbook_entry", () => {
  it("removes the entry from Redis", async () => {
    const added = await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Pagination Best Practices",
      content: "Always use cursor-based pagination for large result sets",
    });

    const deleted = await callTool("delete_playbook_entry", { id: added.id });
    expect(deleted).toEqual({ success: true, id: added.id });

    const raw = await redis.get(`playbook:entry:${added.id}`);
    expect(raw).toBeNull();

    const ids = await redis.smembers("playbook:entries");
    expect(ids).not.toContain(added.id);
  });

  it("entry no longer appears in list after deletion", async () => {
    const added = await callTool("add_playbook_entry", {
      toolName: "general",
      title: "Pagination Best Practices",
      content: "Always use cursor-based pagination for large result sets",
    });

    await callTool("delete_playbook_entry", { id: added.id });

    const entries = await callTool("list_playbook_entries", {});
    expect(entries.find((e) => e.id === added.id)).toBeUndefined();
  });
});
