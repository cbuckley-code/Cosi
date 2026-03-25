import express from "express";
import { chatStream } from "./bedrock-client.js";
import { generateTool, writeToolFiles, toolExists } from "./tool-generator.js";
import { commitAndPush } from "./git-client.js";
import { getToolList, loadRegistry } from "./registry.js";
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
 * Body: { message: string, conversationHistory: Message[] }
 * Streams SSE response
 */
router.post("/chat", async (req, res) => {
  const { message, conversationHistory = [] } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    const messages = [
      ...conversationHistory,
      {
        role: "user",
        content: [{ text: message }],
      },
    ];

    let fullResponse = "";

    sendEvent("start", {});

    for await (const chunk of chatStream(messages, BUILDER_SYSTEM_PROMPT)) {
      fullResponse += chunk;
      sendEvent("chunk", { text: chunk });
    }

    // Check if the response contains GENERATE_TOOL marker
    if (fullResponse.includes("GENERATE_TOOL:")) {
      sendEvent("status", { message: "Generating tool..." });

      try {
        // Extract tool requirements from the response
        const requirementsMatch = fullResponse.match(
          /GENERATE_TOOL:\s*```(?:json)?\s*([\s\S]*?)```/
        );

        if (!requirementsMatch) {
          throw new Error("Could not parse tool requirements from response");
        }

        const requirements = JSON.parse(requirementsMatch[1].trim());
        const toolName = requirements.toolName;

        // Check for name conflicts
        if (await toolExists(toolName)) {
          sendEvent("error", {
            message: `Tool "${toolName}" already exists. Please choose a different name.`,
          });
          sendEvent("done", { response: fullResponse });
          res.end();
          return;
        }

        sendEvent("status", { message: `Generating ${toolName} tool files...` });

        // Generate the tool
        const generated = await generateTool(
          `Tool name: ${requirements.toolName}\nDescription: ${requirements.description}\nTools: ${JSON.stringify(requirements.tools, null, 2)}\nSecrets: ${JSON.stringify(requirements.secrets)}\nIntegrations: ${requirements.integrations?.join(", ")}`,
          []
        );

        const actualToolName = generated.toolName || toolName;
        sendEvent("status", { message: `Writing files for ${actualToolName}...` });

        // Write files
        await writeToolFiles(actualToolName, generated.files);

        sendEvent("status", { message: "Committing to git..." });

        // Commit and push
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
        sendEvent("error", {
          message: `Tool generation failed: ${genErr.message}`,
        });
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
 * GET /api/tools
 * Returns current tool registry
 */
router.get("/tools", async (req, res) => {
  try {
    // Reload registry before returning
    await loadRegistry();
    const tools = getToolList();
    res.json({ tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tools/:name/logs
 * Returns placeholder logs (actual log streaming requires Docker socket)
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
    // Merge with env defaults
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

    // Persist to settings.json
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");

    // Update environment variables for current process
    if (settings.awsRegion) process.env.AWS_REGION = settings.awsRegion;
    if (settings.bedrockModelId) process.env.BEDROCK_MODEL_ID = settings.bedrockModelId;
    if (settings.awsSecretPrefix) process.env.AWS_SECRET_PREFIX = settings.awsSecretPrefix;
    if (settings.gitRepoUrl) process.env.GIT_REPO_URL = settings.gitRepoUrl;
    if (settings.gitBranch) process.env.GIT_BRANCH = settings.gitBranch;

    // Reinitialize AWS clients if region changed
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
