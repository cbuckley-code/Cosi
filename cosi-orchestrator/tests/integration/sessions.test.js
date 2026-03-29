import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { vi } from "vitest";

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

import { createApp } from "../../src/app.js";
import { parseSSEEvents, sseParser } from "../helpers/sse.js";

let app;

beforeAll(async () => {
  app = await createApp();
});

describe("Builder session lifecycle", () => {
  it("creates a new session when no sessionId is provided", async () => {
    const res = await request(app)
      .post("/api/builder/chat")
      .send({ message: "Hello" })
      .parse(sseParser);

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.body);
    const sessionEvent = events.find((e) => e.type === "session");
    expect(sessionEvent).toBeDefined();
    expect(typeof sessionEvent.sessionId).toBe("string");
    expect(sessionEvent.sessionId.length).toBeGreaterThan(0);
  });

  it("reuses an existing session when sessionId is provided", async () => {
    // First request — get a session ID
    const first = await request(app)
      .post("/api/builder/chat")
      .send({ message: "First message" })
      .parse(sseParser);

    const events1 = parseSSEEvents(first.body);
    const { sessionId } = events1.find((e) => e.type === "session");

    // Second request — send the same session ID back
    const second = await request(app)
      .post("/api/builder/chat")
      .send({ message: "Second message", sessionId })
      .parse(sseParser);

    const events2 = parseSSEEvents(second.body);
    const sessionEvent2 = events2.find((e) => e.type === "session");
    expect(sessionEvent2.sessionId).toBe(sessionId);
  });

  it("DELETE /api/builder/session/:id clears the session", async () => {
    // Create a session
    const chatRes = await request(app)
      .post("/api/builder/chat")
      .send({ message: "I want to delete this" })
      .parse(sseParser);

    const { sessionId } = parseSSEEvents(chatRes.body).find(
      (e) => e.type === "session"
    );

    // Delete it
    const delRes = await request(app).delete(
      `/api/builder/session/${sessionId}`
    );
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ success: true });
  });
});

describe("User session lifecycle", () => {
  it("creates a new session for user chat", async () => {
    const res = await request(app)
      .post("/api/user/chat")
      .send({ message: "Hello" })
      .parse(sseParser);

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.body);
    const sessionEvent = events.find((e) => e.type === "session");
    expect(typeof sessionEvent.sessionId).toBe("string");
  });

  it("DELETE /api/user/session/:id clears the session", async () => {
    const chatRes = await request(app)
      .post("/api/user/chat")
      .send({ message: "Delete me" })
      .parse(sseParser);

    const { sessionId } = parseSSEEvents(chatRes.body).find(
      (e) => e.type === "session"
    );

    const delRes = await request(app).delete(
      `/api/user/session/${sessionId}`
    );
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ success: true });
  });
});
