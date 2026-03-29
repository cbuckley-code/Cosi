import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../src/bedrock-client.js", () => ({
  chatStream: vi.fn(async function* () {
    yield "Hello, ";
    yield "world!";
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

import request from "supertest";
import * as bedrockClient from "../../src/bedrock-client.js";
import { createApp } from "../../src/app.js";
import { parseSSEEvents } from "../helpers/sse.js";

let app;

beforeAll(async () => {
  app = await createApp();
});

beforeEach(() => {
  vi.mocked(bedrockClient.chatStream).mockImplementation(async function* () {
    yield "Hello, ";
    yield "world!";
  });
});

describe("POST /api/chat", () => {
  it("rejects requests missing the message field", async () => {
    const res = await request(app).post("/api/chat").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns text/event-stream content type", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "Hello" });

    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
  });

  it("streams session → start → chunk(s) → done events in order", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "Hello" });

    const events = parseSSEEvents(res.text);
    const types = events.map((e) => e.type);

    const sessionIdx = types.indexOf("session");
    const startIdx = types.indexOf("start");
    const doneIdx = types.lastIndexOf("done");

    expect(sessionIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeGreaterThan(sessionIdx);
    expect(doneIdx).toBeGreaterThan(startIdx);
    expect(types).toContain("chunk");
  });

  it("concatenates chunk text to form the full response", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "Hello" });

    const fullText = parseSSEEvents(res.text)
      .filter((e) => e.type === "chunk")
      .map((e) => e.text)
      .join("");

    expect(fullText).toBe("Hello, world!");
  });

  it("includes a UUID sessionId in the session event", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "Hello" });

    const sessionEvent = parseSSEEvents(res.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("accepts an optional sessionId and echoes it back", async () => {
    const sessionId = "11111111-2222-3333-4444-555555555555";
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "Hello", sessionId });

    const sessionEvent = parseSSEEvents(res.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent.sessionId).toBe(sessionId);
  });

  it("streams an error event when Bedrock throws", async () => {
    vi.mocked(bedrockClient.chatStream).mockImplementation(async function* () {
      throw new Error("Bedrock unavailable");
      yield "";
    });

    const res = await request(app)
      .post("/api/chat")
      .send({ message: "Hello" });

    const errorEvent = parseSSEEvents(res.text).find(
      (e) => e.type === "error"
    );
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain("Bedrock unavailable");
  });

  it("calls chatStream with the user message", async () => {
    vi.mocked(bedrockClient.chatStream).mockClear();

    await request(app).post("/api/chat").send({ message: "Tell me something" });

    expect(vi.mocked(bedrockClient.chatStream).mock.calls).toHaveLength(1);
    const messages = vi.mocked(bedrockClient.chatStream).mock.calls[0][0];
    expect(messages.at(-1).role).toBe("user");
  });
});

describe("DELETE /api/chat/session/:id", () => {
  it("returns success for any session ID", async () => {
    const res = await request(app).delete(
      "/api/chat/session/test-session-123"
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("GET /api/chat/tools", () => {
  it("returns a tools array", async () => {
    const res = await request(app).get("/api/chat/tools");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tools");
    expect(Array.isArray(res.body.tools)).toBe(true);
  });
});
