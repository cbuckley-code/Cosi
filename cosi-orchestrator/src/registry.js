import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = process.env.TOOLS_DIR || path.join(__dirname, "../../tools");

// Map: qualifiedName -> { serviceName, originalName, description, inputSchema, healthy }
const toolRegistry = new Map();
// Map: serviceName -> list of tool definitions
const serviceTools = new Map();

/**
 * Scan tools/{name}/tool.json and populate the registry.
 */
export async function loadRegistry() {
  toolRegistry.clear();
  serviceTools.clear();

  let entries;
  try {
    entries = await fs.readdir(TOOLS_DIR, { withFileTypes: true });
  } catch {
    console.log("[registry] tools directory not found or empty");
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const toolDir = entry.name;
    const manifestPath = path.join(TOOLS_DIR, toolDir, "tool.json");

    let manifest;
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      manifest = JSON.parse(raw);
    } catch {
      continue;
    }

    if (manifest.enabled === false) {
      console.log(`[registry] Skipping disabled tool: ${toolDir}`);
      continue;
    }

    const serviceName = `tool-${toolDir}`;
    const tools = [];

    for (const tool of manifest.tools || []) {
      const qualifiedName = `${toolDir}__${tool.name}`;
      const entry = {
        serviceName,
        originalName: tool.name,
        qualifiedName,
        toolDir,
        description: tool.description,
        inputSchema: tool.inputSchema,
        healthy: false,
      };
      toolRegistry.set(qualifiedName, entry);
      tools.push(entry);
    }

    serviceTools.set(serviceName, tools);
  }

  console.log(`[registry] Loaded ${toolRegistry.size} tools from ${serviceTools.size} services`);

  // Health check all tool containers
  await checkHealth();
}

async function checkHealth() {
  for (const [serviceName, tools] of serviceTools) {
    const healthy = await pingService(serviceName);
    for (const tool of tools) {
      const entry = toolRegistry.get(tool.qualifiedName);
      if (entry) entry.healthy = healthy;
    }
    if (healthy) {
      console.log(`[registry] ${serviceName}: healthy`);
    } else {
      console.log(`[registry] ${serviceName}: unreachable`);
    }
  }
}

async function pingService(serviceName) {
  try {
    const url = `http://${serviceName}:3000/health`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return resp.ok;
  } catch {
    return false;
  }
}

export function getAllTools() {
  return Array.from(toolRegistry.values());
}

export function getTool(qualifiedName) {
  return toolRegistry.get(qualifiedName);
}

export function getToolList() {
  return getAllTools().map((t) => ({
    name: t.qualifiedName,
    description: t.description,
    inputSchema: t.inputSchema,
    healthy: t.healthy,
    serviceName: t.serviceName,
  }));
}

/**
 * Return metadata for every tool in TOOLS_DIR, including disabled ones.
 * Does not health-check — intended for the library/management UI.
 */
export async function getLibrary() {
  let entries;
  try {
    entries = await fs.readdir(TOOLS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const library = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const toolDir = entry.name;
    const manifestPath = path.join(TOOLS_DIR, toolDir, "tool.json");
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(raw);
      library.push({
        name: toolDir,
        enabled: manifest.enabled !== false,
        description: manifest.description || "",
        tools: (manifest.tools || []).map((t) => ({
          name: t.name,
          description: t.description || "",
        })),
        secrets: manifest.secrets || [],
      });
    } catch {
      continue;
    }
  }
  return library;
}

/**
 * Call a tool on its container via MCP client.
 */
export async function callTool(qualifiedName, params) {
  const tool = toolRegistry.get(qualifiedName);
  if (!tool) {
    throw new Error(`Tool not found: ${qualifiedName}`);
  }

  const url = new URL(`http://${tool.serviceName}:3000/mcp`);
  const client = new Client({ name: "cosi-orchestrator", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url);

  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: tool.originalName,
      arguments: params,
    });
    return result;
  } finally {
    await client.close();
  }
}
