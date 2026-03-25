import express from "express";
import { chatStream } from "./bedrock-client.js";
import { getAllTools, callTool } from "./registry.js";

const router = express.Router();

function buildUserSystemPrompt() {
  const tools = getAllTools();
  const toolDescriptions = tools
    .map(
      (t) =>
        `- ${t.qualifiedName}: ${t.description}${t.healthy ? "" : " (currently offline)"}`
    )
    .join("\n");

  return `You are Cosi, an AI assistant with access to a suite of custom tools.

Available tools:
${toolDescriptions || "No tools are currently registered."}

Use tools when they are relevant to the user's request. Always explain what you're doing and summarize results clearly.`;
}

/**
 * POST /api/user/chat
 * Streams SSE response, handles tool calls via Bedrock tool use.
 */
router.post("/chat", async (req, res) => {
  const { message, conversationHistory = [] } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

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

    sendEvent("start", {});

    for await (const chunk of chatStream(messages, buildUserSystemPrompt())) {
      sendEvent("chunk", { text: chunk });
    }

    sendEvent("done", {});
    res.end();
  } catch (err) {
    console.error("[user-api] Chat error:", err);
    sendEvent("error", { message: err.message });
    res.end();
  }
});

export default router;
