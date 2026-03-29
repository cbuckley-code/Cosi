import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getAllTools, callTool } from "./registry.js";
import { z } from "zod";

/**
 * Build a fresh McpServer instance with all currently registered tools.
 * Called once per request so each POST /mcp gets a clean Protocol instance
 * (SDK v1.28+ guards against reuse across requests in stateless mode).
 */
export function buildMcpServer() {
  const server = new McpServer({
    name: "cosi-orchestrator",
    version: "1.0.0",
  });

  const tools = getAllTools();
  console.log(`[mcp-server] Registering ${tools.length} tools`);

  for (const tool of tools) {
    // Build a zod schema from the JSON schema inputSchema
    const zodShape = buildZodShape(tool.inputSchema);

    server.tool(
      tool.qualifiedName,
      tool.description || `Tool: ${tool.qualifiedName}`,
      zodShape,
      async (params) => {
        try {
          const result = await callTool(tool.qualifiedName, params);
          return result;
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: `Error calling tool ${tool.qualifiedName}: ${err.message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  // McpServer only registers the tools/list + tools/call handlers lazily the
  // first time server.tool() is called. If no tools are registered the loop
  // above never runs, leaving the server without a tools/list handler and
  // causing clients to receive "Method not found". Force handler registration
  // so tools/list always works (returning an empty array when no tools exist).
  server.setToolRequestHandlers();

  return server;
}

/**
 * Convert a JSON Schema object to a zod shape for McpServer.tool().
 */
function buildZodShape(inputSchema) {
  if (!inputSchema || !inputSchema.properties) return {};

  const shape = {};
  const required = inputSchema.required || [];

  for (const [key, prop] of Object.entries(inputSchema.properties)) {
    let zodType;

    switch (prop.type) {
      case "string":
        zodType = z.string();
        if (prop.description) zodType = zodType.describe(prop.description);
        break;
      case "number":
      case "integer":
        zodType = z.number();
        if (prop.description) zodType = zodType.describe(prop.description);
        break;
      case "boolean":
        zodType = z.boolean();
        if (prop.description) zodType = zodType.describe(prop.description);
        break;
      case "array":
        zodType = z.array(z.any());
        if (prop.description) zodType = zodType.describe(prop.description);
        break;
      case "object":
        zodType = z.record(z.any());
        if (prop.description) zodType = zodType.describe(prop.description);
        break;
      default:
        zodType = z.any();
    }

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return shape;
}

/**
 * Handle an MCP request via streamable HTTP transport.
 * Called for each POST /mcp request.
 */
export async function handleMcpRequest(req, res) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = buildMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
