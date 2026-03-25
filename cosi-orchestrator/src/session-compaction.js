import { chat } from "./bedrock-client.js";
import { loadSession, compactSession } from "./session-store.js";

// Compact when the uncompacted message count exceeds this threshold.
// Each user+assistant exchange = 2 messages. Default: keep last 6 exchanges (12 msgs)
// and compact everything older.
const COMPACTION_THRESHOLD = parseInt(
  process.env.SESSION_COMPACTION_THRESHOLD || "20",
  10
);

// How many recent messages to keep verbatim after compaction.
const MESSAGES_TO_KEEP = 8;

const COMPACTION_SYSTEM_PROMPT = `You are a conversation summarizer. Given a conversation history, produce a concise but complete summary that preserves:
- All decisions made and confirmations given
- Tool names, designs, and requirements that were agreed upon
- Key facts and constraints mentioned
- The current state of what has been built or discussed

Write in third person, past tense. Be specific about names, schemas, and technical details.
Keep it under 400 words. Output ONLY the summary text, no headers or preamble.`;

/**
 * Check if a session needs compaction and compact it if so.
 * Returns the (possibly updated) session.
 *
 * @param {string} sessionId
 * @param {string} type - "builder" or "user"
 * @returns {Promise<{messages: Array, compactedSummary: string|null}>}
 */
export async function maybeCompact(sessionId, type) {
  const session = await loadSession(sessionId, type);
  if (!session) return { messages: [], compactedSummary: null };

  const { messages, compactedSummary } = session;

  if (messages.length < COMPACTION_THRESHOLD) {
    return session;
  }

  console.log(
    `[compaction] Session ${sessionId} has ${messages.length} messages — compacting`
  );

  // Split: compact everything except the last MESSAGES_TO_KEEP messages.
  const toCompact = messages.slice(0, messages.length - MESSAGES_TO_KEEP);
  const toKeep = messages.slice(messages.length - MESSAGES_TO_KEEP);

  // Build the text to summarize, including any prior summary.
  const historyText = buildHistoryText(toCompact, compactedSummary);

  let newSummary;
  try {
    newSummary = await chat(
      [{ role: "user", content: [{ text: historyText }] }],
      COMPACTION_SYSTEM_PROMPT
    );
    console.log(
      `[compaction] Compacted ${toCompact.length} messages → ${newSummary.length} chars`
    );
  } catch (err) {
    // If summarization fails, just drop old messages without a summary rather
    // than crashing — the kept messages still give useful recent context.
    console.error("[compaction] Summarization failed:", err.message);
    newSummary = compactedSummary || "(Earlier conversation history not available)";
  }

  return await compactSession(sessionId, type, toKeep, newSummary);
}

/**
 * Convert message array to readable text for the summarizer.
 */
function buildHistoryText(messages, priorSummary) {
  const lines = [];

  if (priorSummary) {
    lines.push(`[Prior summary]\n${priorSummary}\n\n[Continued conversation]`);
  } else {
    lines.push("[Conversation to summarize]");
  }

  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    const text = extractText(msg.content);
    lines.push(`${role}: ${text}`);
  }

  return lines.join("\n\n");
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c.text) return c.text;
        if (c.type === "tool_use") return `[Tool call: ${c.name}]`;
        if (c.type === "tool_result") return `[Tool result]`;
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return String(content);
}

/**
 * Build the messages array to send to Bedrock, injecting the compacted
 * summary as the first user message if one exists.
 *
 * @param {Array} messages - Recent verbatim messages from the session
 * @param {string|null} compactedSummary
 * @returns {Array} - Bedrock-format messages array
 */
export function buildContextMessages(messages, compactedSummary) {
  if (!compactedSummary) return messages;

  // Inject the summary as a synthetic exchange at the top so the model
  // understands the prior context without seeing every raw message.
  const summaryInjection = [
    {
      role: "user",
      content: [
        {
          text: `[Context from earlier in this conversation]\n${compactedSummary}\n\n[End of context — continuing conversation below]`,
        },
      ],
    },
    {
      role: "assistant",
      content: [
        {
          text: "Understood. I have the context from our earlier conversation.",
        },
      ],
    },
  ];

  return [...summaryInjection, ...messages];
}
