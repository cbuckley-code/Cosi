import { describe, it, expect, vi, beforeEach } from "vitest";

// Set threshold low so tests don't need 20+ messages
process.env.SESSION_COMPACTION_THRESHOLD = "5";

vi.mock("../../src/bedrock-client.js", () => ({
  chat: vi.fn(),
}));

vi.mock("../../src/session-store.js", () => ({
  loadSession: vi.fn(),
  compactSession: vi.fn(),
}));

const { chat } = await import("../../src/bedrock-client.js");
const { loadSession, compactSession } = await import("../../src/session-store.js");
const { buildContextMessages, maybeCompact } = await import(
  "../../src/session-compaction.js"
);

describe("buildContextMessages", () => {
  it("returns messages unchanged when no summary", () => {
    const messages = [
      { role: "user", content: [{ text: "hello" }] },
      { role: "assistant", content: [{ text: "hi" }] },
    ];
    const result = buildContextMessages(messages, null);
    expect(result).toBe(messages);
  });

  it("returns messages unchanged when summary is undefined", () => {
    const messages = [{ role: "user", content: [{ text: "hi" }] }];
    const result = buildContextMessages(messages, undefined);
    expect(result).toBe(messages);
  });

  it("prepends two synthetic messages when summary is present", () => {
    const messages = [{ role: "user", content: [{ text: "real message" }] }];
    const result = buildContextMessages(messages, "Earlier summary text");
    expect(result).toHaveLength(3);
  });

  it("first prepended message has user role", () => {
    const messages = [{ role: "user", content: [{ text: "real message" }] }];
    const result = buildContextMessages(messages, "Summary here");
    expect(result[0].role).toBe("user");
  });

  it("first prepended message content contains the summary text", () => {
    const messages = [{ role: "user", content: [{ text: "real message" }] }];
    const summary = "This is the summary of earlier conversation";
    const result = buildContextMessages(messages, summary);
    const text = result[0].content[0].text;
    expect(text).toContain(summary);
  });

  it("second prepended message has assistant role", () => {
    const messages = [{ role: "user", content: [{ text: "msg" }] }];
    const result = buildContextMessages(messages, "summary");
    expect(result[1].role).toBe("assistant");
  });

  it("original messages appear after the synthetic pair", () => {
    const messages = [
      { role: "user", content: [{ text: "first real" }] },
      { role: "assistant", content: [{ text: "second real" }] },
    ];
    const result = buildContextMessages(messages, "summary");
    expect(result[2]).toBe(messages[0]);
    expect(result[3]).toBe(messages[1]);
  });

  it("works with an empty messages array and a summary", () => {
    const result = buildContextMessages([], "summary");
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
  });
});

describe("maybeCompact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { messages: [], compactedSummary: null } when session not found", async () => {
    loadSession.mockResolvedValue(null);
    const result = await maybeCompact("sess-1", "builder");
    expect(result).toEqual({ messages: [], compactedSummary: null });
  });

  it("returns session unchanged when message count < COMPACTION_THRESHOLD (5)", async () => {
    const session = {
      messages: [
        { role: "user", content: [{ text: "a" }] },
        { role: "assistant", content: [{ text: "b" }] },
      ],
      compactedSummary: null,
    };
    loadSession.mockResolvedValue(session);
    const result = await maybeCompact("sess-2", "builder");
    expect(result).toBe(session);
    expect(chat).not.toHaveBeenCalled();
    expect(compactSession).not.toHaveBeenCalled();
  });

  it("returns session unchanged when message count equals threshold minus 1", async () => {
    // threshold is 5, so 4 messages should NOT trigger compaction
    const messages = Array.from({ length: 4 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: [{ text: `message ${i}` }],
    }));
    const session = { messages, compactedSummary: null };
    loadSession.mockResolvedValue(session);
    const result = await maybeCompact("sess-3", "builder");
    expect(result).toBe(session);
    expect(chat).not.toHaveBeenCalled();
  });

  it("calls chat() and compactSession() when count >= threshold", async () => {
    // threshold is 5, so 5+ messages trigger compaction
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: [{ text: `message ${i}` }],
    }));
    const session = { messages, compactedSummary: null };
    loadSession.mockResolvedValue(session);
    chat.mockResolvedValue("Compacted summary text");
    const compactedSession = {
      messages: messages.slice(-8),
      compactedSummary: "Compacted summary text",
    };
    compactSession.mockResolvedValue(compactedSession);

    const result = await maybeCompact("sess-4", "builder");

    expect(chat).toHaveBeenCalledOnce();
    expect(compactSession).toHaveBeenCalledOnce();
    expect(result).toBe(compactedSession);
  });

  it("calls compactSession with the chat() result as the summary", async () => {
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: [{ text: `msg ${i}` }],
    }));
    loadSession.mockResolvedValue({ messages, compactedSummary: null });
    chat.mockResolvedValue("Generated summary");
    compactSession.mockResolvedValue({ messages: [], compactedSummary: "Generated summary" });

    await maybeCompact("sess-5", "builder");

    const [, , , summary] = compactSession.mock.calls[0];
    expect(summary).toBe("Generated summary");
  });

  it("when chat() throws, still calls compactSession with a fallback summary", async () => {
    const messages = Array.from({ length: 7 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: [{ text: `msg ${i}` }],
    }));
    loadSession.mockResolvedValue({ messages, compactedSummary: null });
    chat.mockRejectedValue(new Error("Bedrock error"));
    compactSession.mockResolvedValue({ messages: [], compactedSummary: "fallback" });

    await maybeCompact("sess-6", "builder");

    expect(compactSession).toHaveBeenCalledOnce();
    // The fallback summary used when there's no prior summary
    const [, , , summary] = compactSession.mock.calls[0];
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("when chat() throws and a prior summary exists, preserves it as fallback", async () => {
    const messages = Array.from({ length: 7 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: [{ text: `msg ${i}` }],
    }));
    const priorSummary = "Old summary from before";
    loadSession.mockResolvedValue({ messages, compactedSummary: priorSummary });
    chat.mockRejectedValue(new Error("Bedrock unavailable"));
    compactSession.mockResolvedValue({ messages: [], compactedSummary: priorSummary });

    await maybeCompact("sess-7", "builder");

    const [, , , summary] = compactSession.mock.calls[0];
    expect(summary).toBe(priorSummary);
  });

  it("passes sessionId and type to loadSession", async () => {
    loadSession.mockResolvedValue(null);
    await maybeCompact("my-session", "user");
    expect(loadSession).toHaveBeenCalledWith("my-session", "user");
  });
});
