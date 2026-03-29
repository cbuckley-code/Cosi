import { chat } from "./bedrock-client.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = process.env.TOOLS_DIR || path.join(__dirname, "../../tools");

const GENERATION_SYSTEM_PROMPT = `You are an expert MCP (Model Context Protocol) server developer. Your job is to generate complete, production-ready MCP tool server implementations.

When given a tool description, generate a complete tool implementation using this exact structure:

\`\`\`json
{
  "toolName": "kebab-case-name",
  "files": {
    "index.js": "... full source code ...",
    "tool.json": "... tool manifest as JSON string ...",
    "package.json": "... package.json as JSON string ...",
    "Dockerfile": "... Dockerfile content ...",
    "system-prompt.md": "... description of the tool ..."
  }
}
\`\`\`

Requirements for generated code:
- Use @modelcontextprotocol/sdk for MCP server
- Use StreamableHTTPServerTransport for transport (from "@modelcontextprotocol/sdk/server/streamableHttp.js")
- Use Express.js as HTTP server
- Listen on port 3000
- Include GET /health endpoint that returns JSON { status: "ok", tool: "<toolName>" }
- Include POST /mcp endpoint for streamable HTTP transport
- Use ES modules (type: module in package.json)
- Handle errors gracefully with try/catch and meaningful error messages returned as MCP error responses
- Read secrets/credentials from environment variables (UPPERCASE_SNAKE_CASE)
- Node.js 20 alpine for Dockerfile
- The MCP server must properly handle stateless requests (sessionIdGenerator: undefined)
- ALWAYS include the playbook helper (see below) and call it at the start of every tool handler

Playbook integration — include this helper in every generated tool:
\`\`\`javascript
// Fetches relevant playbook entries from the shared playbook service.
// Returns an empty array gracefully if the service is unavailable.
async function getPlaybookContext(toolName, query) {
  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const client = new Client({ name: toolName, version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL("http://tool-playbook:3000/mcp")
    );
    await client.connect(transport);
    try {
      const result = await client.callTool({
        name: "search_playbook",
        arguments: { query, toolName, topK: 3 },
      });
      return JSON.parse(result.content[0].text);
    } finally {
      await client.close();
    }
  } catch {
    return [];
  }
}
\`\`\`

In every tool handler, call getPlaybookContext and include the results in the response:
\`\`\`javascript
server.tool("tool_name", "Description", { param: z.string() }, async ({ param }) => {
  try {
    const playbook = await getPlaybookContext("tool-name", \`tool_name \${param}\`);
    // ... implementation ...
    const response = { result, playbook };
    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  } catch (err) {
    return { content: [{ type: "text", text: \`Error: \${err.message}\` }], isError: true };
  }
});
\`\`\`

Example index.js structure (with playbook integration):
\`\`\`javascript
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "tool-name",
  version: "1.0.0"
});

async function getPlaybookContext(toolName, query) {
  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const client = new Client({ name: toolName, version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://tool-playbook:3000/mcp"));
    await client.connect(transport);
    try {
      const result = await client.callTool({ name: "search_playbook", arguments: { query, toolName, topK: 3 } });
      return JSON.parse(result.content[0].text);
    } finally {
      await client.close();
    }
  } catch {
    return [];
  }
}

server.tool("tool_name", "Description", { param: z.string() }, async ({ param }) => {
  try {
    const playbook = await getPlaybookContext("tool-name", \`tool_name \${param}\`);
    // implementation
    const result = {}; // replace with actual result
    return { content: [{ type: "text", text: JSON.stringify({ result, playbook }) }] };
  } catch (err) {
    return { content: [{ type: "text", text: \`Error: \${err.message}\` }], isError: true };
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", tool: "tool-name" }));

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.writeHead(200, { "Content-Type": "application/json", "Transfer-Encoding": "chunked" });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000, () => console.log("tool-name MCP server listening on port 3000"));
\`\`\`

Note: @modelcontextprotocol/sdk includes zod, use it for schema validation.

The tool.json must follow this schema:
{
  "name": "tool-name",
  "description": "...",
  "version": "1.0.0",
  "tools": [{ "name": "...", "description": "...", "inputSchema": { "type": "object", "properties": {...}, "required": [...] } }],
  "secrets": ["secret-name-1", "secret-name-2"],
  "port": 3000
}

Generate ONLY the JSON code block, no other text before or after.`;

/**
 * Parse the JSON from a code block in the LLM response.
 */
function parseGeneratedOutput(text) {
  // Try to extract JSON from code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }
  // Try raw JSON
  return JSON.parse(text.trim());
}

/**
 * Generate tool files from a description using Bedrock.
 */
export async function generateTool(toolDescription, conversationHistory = []) {
  const messages = [
    ...conversationHistory,
    {
      role: "user",
      content: [
        {
          text: `Generate a complete MCP tool server implementation for the following tool:\n\n${toolDescription}\n\nRespond with ONLY the JSON code block containing the implementation.`,
        },
      ],
    },
  ];

  const response = await chat(messages, GENERATION_SYSTEM_PROMPT);
  const generated = parseGeneratedOutput(response);

  return generated;
}

/**
 * Write generated tool files to disk.
 */
export async function writeToolFiles(toolName, files) {
  const toolDir = path.join(TOOLS_DIR, toolName);
  await fs.mkdir(toolDir, { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(toolDir, filename);
    let fileContent = content;
    // If the content is an object (e.g., parsed JSON for package.json/tool.json), stringify it
    if (typeof content === "object") {
      fileContent = JSON.stringify(content, null, 2);
    }
    await fs.writeFile(filePath, fileContent, "utf8");
    console.log(`[tool-generator] Wrote ${filePath}`);
  }

  return toolDir;
}

/**
 * Check if a tool name already exists.
 */
export async function toolExists(toolName) {
  const toolDir = path.join(TOOLS_DIR, toolName);
  try {
    await fs.access(toolDir);
    return true;
  } catch {
    return false;
  }
}
