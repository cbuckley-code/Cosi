import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/bedrock-client.js", () => ({
  chatStream: vi.fn(async function* () {
    yield "Hello from mock!";
  }),
  chat: vi.fn(async () => "Compacted summary"),
  getModelId: vi.fn(() => "test-model"),
  reinitialize: vi.fn(),
}));

vi.mock("../../src/git-client.js", () => ({
  commitAndPush: vi.fn(),
}));

vi.mock("../../src/secrets.js", () => ({
  getSecret: vi.fn(async () => "mock-secret"),
  reinitialize: vi.fn(),
}));

vi.mock("../../src/tool-generator.js", () => ({
  generateTool: vi.fn(),
  writeToolFiles: vi.fn(),
  toolExists: vi.fn(async () => false),
}));

import * as bedrockClient from "../../src/bedrock-client.js";
import { createApp } from "../../src/app.js";
import { parseSSEEvents } from "../helpers/sse.js";

let app;

beforeAll(async () => {
  app = await createApp();
});

beforeEach(() => {
  vi.mocked(bedrockClient.chatStream).mockImplementation(async function* () {
    yield "Hello from mock!";
  });
});

describe("Session lifecycle via /api/chat", () => {
  it("creates a new session when no sessionId is provided", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "Hello" });

    expect(res.status).toBe(200);
    const sessionEvent = parseSSEEvents(res.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent).toBeDefined();
    expect(typeof sessionEvent.sessionId).toBe("string");
    expect(sessionEvent.sessionId.length).toBeGreaterThan(0);
  });

  it("reuses an existing session when sessionId is provided", async () => {
    const first = await request(app)
      .post("/api/chat")
      .send({ message: "First message" });

    const { sessionId } = parseSSEEvents(first.text).find(
      (e) => e.type === "session"
    );

    const second = await request(app)
      .post("/api/chat")
      .send({ message: "Second message", sessionId });

    const sessionEvent2 = parseSSEEvents(second.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent2.sessionId).toBe(sessionId);
  });

  it("accumulates message history across requests in the same session", async () => {
    // First request — establishes session
    const first = await request(app)
      .post("/api/chat")
      .send({ message: "First message" });

    const { sessionId } = parseSSEEvents(first.text).find(
      (e) => e.type === "session"
    );

    vi.mocked(bedrockClient.chatStream).mockClear();

    // Second request in the same session
    await request(app)
      .post("/api/chat")
      .send({ message: "Second message", sessionId });

    expect(vi.mocked(bedrockClient.chatStream).mock.calls).toHaveLength(1);
    const messages = vi.mocked(bedrockClient.chatStream).mock.calls[0][0];

    // chatStream should receive the full accumulated history:
    // [user: "First message", assistant: "Hello from mock!", user: "Second message"]
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[2].role).toBe("user");

    // Verify the content of each message
    expect(messages[0].content[0].text).toBe("First message");
    expect(messages[1].content[0].text).toBe("Hello from mock!");
    // Last message is the new one (content may have a type field from buildUserContent)
    const lastContent = messages[2].content[0];
    expect(lastContent.text).toBe("Second message");
  });

  it("DELETE /api/chat/session/:id clears the session", async () => {
    const chatRes = await request(app)
      .post("/api/chat")
      .send({ message: "I want to delete this" });

    const sessionEvent = parseSSEEvents(chatRes.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent).toBeDefined();
    const { sessionId } = sessionEvent;

    const delRes = await request(app).delete(
      `/api/chat/session/${sessionId}`
    );
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ success: true });
  });

  it("cleared session starts fresh on the next request", async () => {
    // Build up some history
    const first = await request(app)
      .post("/api/chat")
      .send({ message: "Remember me" });

    const { sessionId } = parseSSEEvents(first.text).find(
      (e) => e.type === "session"
    );

    // Delete the session
    await request(app).delete(`/api/chat/session/${sessionId}`);

    vi.mocked(bedrockClient.chatStream).mockClear();

    // Next request with the same sessionId — should start with no history
    await request(app)
      .post("/api/chat")
      .send({ message: "Fresh start", sessionId });

    expect(vi.mocked(bedrockClient.chatStream).mock.calls).toHaveLength(1);
    const messages = vi.mocked(bedrockClient.chatStream).mock.calls[0][0];

    // Only the new message — no history from before the delete
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    const content = messages[0].content[0];
    expect(content.text).toBe("Fresh start");
  });
});
