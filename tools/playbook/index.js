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

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const TITAN_MODEL_ID = "amazon.titan-embed-text-v2:0";
const ENTRIES_KEY = "playbook:entries";

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
});

const bedrock = new BedrockRuntimeClient({ region: AWS_REGION });

async function getEmbedding(text) {
  const command = new InvokeModelCommand({
    modelId: TITAN_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      inputText: text,
      dimensions: 1024,
      normalize: true,
    }),
  });
  const response = await bedrock.send(command);
  const body = JSON.parse(new TextDecoder().decode(response.body));
  return body.embedding;
}

function cosineSimilarity(a, b) {
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

const app = express();
app.use(express.json());

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
      .describe(
        "Full description of the pattern, optimization, or lesson learned"
      ),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags for categorization (e.g. ['pagination', 'rate-limiting'])"),
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
        content: [{ type: "text", text: JSON.stringify({ success: true, id }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

app.get("/health", (req, res) => res.json({ status: "ok", tool: "playbook" }));

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Transfer-Encoding": "chunked",
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000, () =>
  console.log("playbook MCP server listening on port 3000")
);
