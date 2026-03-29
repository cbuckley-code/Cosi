import express from "express";
import { v4 as uuidv4 } from "uuid";
import { chatStream } from "./bedrock-client.js";
import { generateTool, writeToolFiles, toolExists } from "./tool-generator.js";
import { commitAndPush } from "./git-client.js";
import { getToolList, loadRegistry } from "./registry.js";
import { appendMessages, deleteSession } from "./session-store.js";
import { maybeCompact, buildContextMessages } from "./session-compaction.js";
import { buildUserContent } from "./attachments.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(__dirname, "../../settings.json");

const BUILDER_SYSTEM_PROMPT = `You are Cosi's builder assistant. Your job is to help users design and create MCP tool servers.

When a user describes a tool they want:
1. Ask clarifying questions about:
   - What operations/functions the tool should expose
   - What external services or APIs it integrates with
   - What authentication/credentials are needed
   - What input/output schemas make sense
2. Present a clear tool design summary including:
   - Tool name (kebab-case)
   - Description
   - List of tools with their inputs and outputs
   - Required secrets/credentials
3. Ask for confirmation before generating

When the user confirms and you have enough information, respond with a special marker and the tool requirements in a JSON block like this:

GENERATE_TOOL:
\`\`\`json
{
  "toolName": "kebab-case-name",
  "description": "What this tool does",
  "tools": [
    {
      "name": "function_name",
      "description": "What this function does",
      "inputs": { "param": "description" }
    }
  ],
  "secrets": ["secret-name"],
  "integrations": ["Service name or API"]
}
\`\`\`

Requirements for generated tools:
- Use @modelcontextprotocol/sdk for MCP server
- Use StreamableHTTPServerTransport for transport
- Use Express.js as HTTP server
- Listen on port 3000
- Include GET /health endpoint
- Use ES modules
- Handle errors gracefully
- Read secrets from environment variables`;

const router = express.Router();

/**
 * POST /api/builder/chat
 * Body: { message: string, sessionId?: string }
 * Streams SSE response. Session history is managed server-side in Redis.
 */
router.post("/builder/chat", async (req, res) => {
  const { message, sessionId: incomingSessionId, attachments = [] } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  const sessionId = incomingSessionId || uuidv4();

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  // Always send back the session ID so the client can persist it
  sendEvent("session", { sessionId });

  try {
    // Run compaction if needed, then load the (possibly compacted) session
    const session = await maybeCompact(sessionId, "builder");
    const { messages: storedMessages, compactedSummary } = session;

    // Build the messages array to send to Bedrock
    const contextMessages = buildContextMessages(storedMessages, compactedSummary);
    const userContent = buildUserContent(message, attachments);
    const messages = [
      ...contextMessages,
      { role: "user", content: userContent },
    ];

    let fullResponse = "";
    sendEvent("start", {});

    for await (const chunk of chatStream(messages, BUILDER_SYSTEM_PROMPT)) {
      fullResponse += chunk;
      sendEvent("chunk", { text: chunk });
    }

    // Persist the new exchange to Redis
    await appendMessages(sessionId, "builder", [
      { role: "user", content: [{ text: message }] },
      { role: "assistant", content: [{ text: fullResponse }] },
    ]);

    // Check if the response contains GENERATE_TOOL marker
    if (fullResponse.includes("GENERATE_TOOL:")) {
      sendEvent("status", { message: "Generating tool..." });

      try {
        const requirementsMatch = fullResponse.match(
          /GENERATE_TOOL:\s*```(?:json)?\s*([\s\S]*?)```/
        );

        if (!requirementsMatch) {
          throw new Error("Could not parse tool requirements from response");
        }

        const requirements = JSON.parse(requirementsMatch[1].trim());
        const toolName = requirements.toolName;

        if (await toolExists(toolName)) {
          sendEvent("error", {
            message: `Tool "${toolName}" already exists. Please choose a different name.`,
          });
          sendEvent("done", { response: fullResponse });
          res.end();
          return;
        }

        sendEvent("status", { message: `Generating ${toolName} tool files...` });

        const generated = await generateTool(
          `Tool name: ${requirements.toolName}\nDescription: ${requirements.description}\nTools: ${JSON.stringify(requirements.tools, null, 2)}\nSecrets: ${JSON.stringify(requirements.secrets)}\nIntegrations: ${requirements.integrations?.join(", ")}`,
          []
        );

        const actualToolName = generated.toolName || toolName;
        sendEvent("status", { message: `Writing files for ${actualToolName}...` });

        await writeToolFiles(actualToolName, generated.files);

        sendEvent("status", { message: "Committing to git..." });

        await commitAndPush(
          actualToolName,
          `feat: add tool ${actualToolName} via Cosi builder`
        );

        sendEvent("tool_created", {
          toolName: actualToolName,
          files: Object.keys(generated.files),
          message: `Tool "${actualToolName}" created successfully! The builder sidecar will build and deploy it shortly.`,
        });
      } catch (genErr) {
        console.error("[builder-api] Tool generation error:", genErr);
        sendEvent("error", { message: `Tool generation failed: ${genErr.message}` });
      }
    }

    sendEvent("done", { response: fullResponse });
    res.end();
  } catch (err) {
    console.error("[builder-api] Chat error:", err);
    sendEvent("error", { message: err.message });
    res.end();
  }
});

/**
 * DELETE /api/builder/session/:sessionId
 * Clear a builder session from Redis.
 */
router.delete("/builder/session/:sessionId", async (req, res) => {
  await deleteSession(req.params.sessionId, "builder");
  res.json({ success: true });
});

/**
 * GET /api/tools
 */
router.get("/tools", async (req, res) => {
  try {
    await loadRegistry();
    const tools = getToolList();
    res.json({ tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tools/:name/logs
 */
router.get("/tools/:name/logs", async (req, res) => {
  res.json({
    tool: req.params.name,
    logs: ["Log streaming requires Docker socket access (available in builder sidecar)"],
  });
});

/**
 * GET /api/settings
 */
router.get("/settings", async (req, res) => {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8").catch(() => "{}");
    const settings = JSON.parse(raw);
    res.json({
      gitRepoUrl: settings.gitRepoUrl || process.env.GIT_REPO_URL || "",
      gitBranch: settings.gitBranch || process.env.GIT_BRANCH || "main",
      awsRegion: settings.awsRegion || process.env.AWS_REGION || "us-west-2",
      awsGovCloud: settings.awsGovCloud || process.env.AWS_GOVCLOUD === "true" || false,
      bedrockModelId:
        settings.bedrockModelId ||
        process.env.BEDROCK_MODEL_ID ||
        "anthropic.claude-sonnet-4-20250514-v1:0",
      awsSecretPrefix:
        settings.awsSecretPrefix || process.env.AWS_SECRET_PREFIX || "cosi/",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings
 */
router.post("/settings", async (req, res) => {
  try {
    const settings = req.body;
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");

    if (settings.awsRegion) process.env.AWS_REGION = settings.awsRegion;
    if (settings.bedrockModelId) process.env.BEDROCK_MODEL_ID = settings.bedrockModelId;
    if (settings.awsSecretPrefix) process.env.AWS_SECRET_PREFIX = settings.awsSecretPrefix;
    if (settings.gitRepoUrl) process.env.GIT_REPO_URL = settings.gitRepoUrl;
    if (settings.gitBranch) process.env.GIT_BRANCH = settings.gitBranch;

    const { reinitialize: reinitBedrock } = await import("./bedrock-client.js");
    const { reinitialize: reinitSecrets } = await import("./secrets.js");
    reinitBedrock();
    reinitSecrets();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
