import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import Redis from "ioredis";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const ENTRIES_KEY = "playbook:entries";

export function cosineSimilarity(a, b) {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function createApp() {
  const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    lazyConnect: true,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
  });

  const bedrock = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
  });

  async function getEmbedding(text) {
    const command = new InvokeModelCommand({
      modelId: "amazon.titan-embed-text-v2:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: text, dimensions: 1024, normalize: true }),
    });
    const response = await bedrock.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    return body.embedding;
  }

  async function fetchAllEntries() {
    const ids = await redis.smembers(ENTRIES_KEY);
    if (ids.length === 0) return [];
    const pipeline = redis.pipeline();
    for (const id of ids) pipeline.get(`playbook:entry:${id}`);
    const results = await pipeline.exec();
    return results
      .map(([err, val]) => (err || !val ? null : JSON.parse(val)))
      .filter(Boolean);
  }

  // In SDK v1.28+, Protocol.connect() guards against reuse across requests in
  // stateless mode.  Create a fresh McpServer per request so each POST /mcp
  // starts with a clean Protocol instance and no "Already connected" conflict.
  function buildServer() {
    const server = new McpServer({ name: "playbook", version: "1.0.0" });

    server.tool(
      "add_playbook_entry",
      "Add a playbook entry documenting a tool usage pattern, optimization, or lesson learned",
      {
        toolName: z
          .string()
          .describe(
            "Name of the tool this entry is about. Use 'general' for cross-tool patterns"
          ),
        title: z.string().describe("Short descriptive title for the entry"),
        content: z
          .string()
          .describe("Full description of the pattern, optimization, or lesson learned"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional tags for categorization"),
      },
      async ({ toolName, title, content, tags = [] }) => {
        try {
          const id = randomUUID();
          const embedding = await getEmbedding(`${title}\n${content}`);
          const entry = {
            id,
            toolName,
            title,
            content,
            tags,
            embedding,
            createdAt: new Date().toISOString(),
          };
          await redis.set(`playbook:entry:${id}`, JSON.stringify(entry));
          await redis.sadd(ENTRIES_KEY, id);
          return {
            content: [
              { type: "text", text: JSON.stringify({ id, title, toolName, tags }) },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "search_playbook",
      "Search the playbook for relevant entries using semantic similarity against Amazon Titan Text embeddings",
      {
        query: z
          .string()
          .describe("Natural language query describing the pattern or context you are looking for"),
        toolName: z
          .string()
          .optional()
          .describe(
            "Optional: narrow results to a specific tool name (entries tagged 'general' are always included)"
          ),
        topK: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Maximum number of results to return (default 5)"),
      },
      async ({ query, toolName, topK = 5 }) => {
        try {
          const all = await fetchAllEntries();
          if (all.length === 0) {
            return { content: [{ type: "text", text: "[]" }] };
          }

          const queryEmbedding = await getEmbedding(query);

          const candidates = toolName
            ? all.filter((e) => e.toolName === toolName || e.toolName === "general")
            : all;

          const scored = candidates
            .map(({ embedding, ...rest }) => ({
              ...rest,
              score: cosineSimilarity(queryEmbedding, embedding),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

          return { content: [{ type: "text", text: JSON.stringify(scored) }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "list_playbook_entries",
      "List all playbook entries, optionally filtered by tool name",
      {
        toolName: z
          .string()
          .optional()
          .describe("Optional: filter entries by tool name"),
      },
      async ({ toolName }) => {
        try {
          const all = await fetchAllEntries();
          const filtered = toolName
            ? all.filter((e) => e.toolName === toolName)
            : all;
          const safe = filtered.map(({ embedding: _e, ...rest }) => rest);
          return { content: [{ type: "text", text: JSON.stringify(safe) }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "delete_playbook_entry",
      "Delete a playbook entry by its ID",
      {
        id: z.string().describe("The UUID of the playbook entry to delete"),
      },
      async ({ id }) => {
        try {
          await redis.del(`playbook:entry:${id}`);
          await redis.srem(ENTRIES_KEY, id);
          return {
            content: [
              { type: "text", text: JSON.stringify({ success: true, id }) },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      }
    );

    return server;
  }

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) =>
    res.json({ status: "ok", tool: "playbook" })
  );

  // The MCP SDK client (v1.28+) probes GET /mcp for an SSE stream first.
  // Return 405 so the client falls back to stateless POST-only mode.
  app.get("/mcp", (_req, res) => res.status(405).end());

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = buildServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return app;
}

// Only start listening when run directly (not imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(3000, () =>
    console.log("playbook MCP server listening on port 3000")
  );
}
