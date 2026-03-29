import express from "express";
import { v4 as uuidv4 } from "uuid";
import { chatStream } from "./bedrock-client.js";
import { getAllTools, getToolList, loadRegistry } from "./registry.js";
import { generateTool, writeToolFiles, toolExists } from "./tool-generator.js";
import { commitAndPush } from "./git-client.js";
import { appendMessages, deleteSession } from "./session-store.js";
import { maybeCompact, buildContextMessages } from "./session-compaction.js";
import { buildUserContent } from "./attachments.js";

const router = express.Router();

function buildSystemPrompt() {
  const tools = getAllTools();
  const toolDescriptions = tools.length
    ? tools
        .map(
          (t) =>
            `- ${t.qualifiedName}: ${t.description}${t.healthy ? "" : " (currently offline)"}`
        )
        .join("\n")
    : "No tools are currently registered — you can create one by asking below.";

  return `You are Cosi, an AI assistant with two capabilities:

**Using Tools**
You have access to these custom MCP tools:
${toolDescriptions}

Use tools proactively when they can help answer the user's request. Always explain what you're doing and summarise results clearly.

**Creating Tools**
You can also build new MCP tool servers when asked. When a user wants to create or modify a tool:
1. Ask clarifying questions about the tool's name, purpose, inputs/outputs, and any required credentials/secrets
2. Present a clear design summary and ask for confirmation before generating
3. Once confirmed, respond with a GENERATE_TOOL marker followed by a JSON spec:

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
- Use @modelcontextprotocol/sdk with StreamableHTTPServerTransport
- Use Express.js, listen on port 3000
- Include GET /health endpoint
- Use ES modules
- Read secrets from environment variables
- Handle errors gracefully`;
}

/**
 * POST /api/chat
 * Unified chat endpoint — can use existing tools and create new ones.
 * Body: { message: string, sessionId?: string, attachments?: array }
 * Response: SSE stream
 */
router.post("/chat", async (req, res) => {
  const { message, sessionId: incomingSessionId, attachments = [] } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  const sessionId = incomingSessionId || uuidv4();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  sendEvent("session", { sessionId });

  try {
    const session = await maybeCompact(sessionId, "chat");
    const { messages: storedMessages, compactedSummary } = session;

    const contextMessages = buildContextMessages(storedMessages, compactedSummary);
    const userContent = buildUserContent(message, attachments);
    const messages = [
      ...contextMessages,
      { role: "user", content: userContent },
    ];

    let fullResponse = "";
    sendEvent("start", {});

    for await (const chunk of chatStream(messages, buildSystemPrompt())) {
      fullResponse += chunk;
      sendEvent("chunk", { text: chunk });
    }

    await appendMessages(sessionId, "chat", [
      { role: "user", content: [{ text: message }] },
      { role: "assistant", content: [{ text: fullResponse }] },
    ]);

    // Handle tool generation if the response contains the marker
    if (fullResponse.includes("GENERATE_TOOL:")) {
      sendEvent("status", { message: "Generating tool…" });

      try {
        const match = fullResponse.match(
          /GENERATE_TOOL:\s*```(?:json)?\s*([\s\S]*?)```/
        );
        if (!match) throw new Error("Could not parse tool requirements from response");

        const requirements = JSON.parse(match[1].trim());
        const toolName = requirements.toolName;

        if (await toolExists(toolName)) {
          sendEvent("error", {
            message: `Tool "${toolName}" already exists. Choose a different name.`,
          });
        } else {
          sendEvent("status", { message: `Generating ${toolName} files…` });

          const generated = await generateTool(
            `Tool name: ${requirements.toolName}\nDescription: ${requirements.description}\nTools: ${JSON.stringify(requirements.tools, null, 2)}\nSecrets: ${JSON.stringify(requirements.secrets)}\nIntegrations: ${requirements.integrations?.join(", ")}`,
            []
          );

          const actualToolName = generated.toolName || toolName;
          sendEvent("status", { message: `Writing files for ${actualToolName}…` });

          await writeToolFiles(actualToolName, generated.files);

          sendEvent("status", { message: "Committing to git…" });
          await commitAndPush(
            actualToolName,
            `feat: add tool ${actualToolName} via Cosi`
          );

          sendEvent("tool_created", {
            toolName: actualToolName,
            files: Object.keys(generated.files),
            message: `Tool "${actualToolName}" created! The builder sidecar will build and deploy it shortly.`,
          });
        }
      } catch (genErr) {
        console.error("[chat-api] Tool generation error:", genErr);
        sendEvent("error", { message: `Tool generation failed: ${genErr.message}` });
      }
    }

    sendEvent("done", {});
    res.end();
  } catch (err) {
    console.error("[chat-api] Error:", err);
    sendEvent("error", { message: err.message });
    res.end();
  }
});

/**
 * DELETE /api/chat/session/:sessionId
 */
router.delete("/chat/session/:sessionId", async (req, res) => {
  await deleteSession(req.params.sessionId, "chat");
  res.json({ success: true });
});

/**
 * GET /api/chat/tools  — convenience alias that also refreshes the registry
 */
router.get("/chat/tools", async (req, res) => {
  try {
    await loadRegistry();
    res.json({ tools: getToolList() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
