import express from "express";
import { v4 as uuidv4 } from "uuid";
import { chatStream } from "./bedrock-client.js";
import { getAllTools } from "./registry.js";
import { appendMessages, deleteSession } from "./session-store.js";
import { maybeCompact, buildContextMessages } from "./session-compaction.js";

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
 * Body: { message: string, sessionId?: string }
 * Streams SSE response. Session history is managed server-side in Redis.
 */
router.post("/chat", async (req, res) => {
  const { message, sessionId: incomingSessionId } = req.body;

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
    // Run compaction if needed, then load session
    const session = await maybeCompact(sessionId, "user");
    const { messages: storedMessages, compactedSummary } = session;

    const contextMessages = buildContextMessages(storedMessages, compactedSummary);
    const messages = [
      ...contextMessages,
      { role: "user", content: [{ text: message }] },
    ];

    let fullResponse = "";
    sendEvent("start", {});

    for await (const chunk of chatStream(messages, buildUserSystemPrompt())) {
      fullResponse += chunk;
      sendEvent("chunk", { text: chunk });
    }

    // Persist the exchange
    await appendMessages(sessionId, "user", [
      { role: "user", content: [{ text: message }] },
      { role: "assistant", content: [{ text: fullResponse }] },
    ]);

    sendEvent("done", {});
    res.end();
  } catch (err) {
    console.error("[user-api] Chat error:", err);
    sendEvent("error", { message: err.message });
    res.end();
  }
});

/**
 * DELETE /api/user/session/:sessionId
 * Clear a user session from Redis.
 */
router.delete("/session/:sessionId", async (req, res) => {
  await deleteSession(req.params.sessionId, "user");
  res.json({ success: true });
});

export default router;
