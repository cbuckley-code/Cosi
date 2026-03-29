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
import { parseSSEEvents } from "../helpers/sse.js";

let app;

beforeAll(async () => {
  app = await createApp();
});

describe("Builder session lifecycle", () => {
  it("creates a new session when no sessionId is provided", async () => {
    const res = await request(app)
      .post("/api/builder/chat")
      .send({ message: "Hello" });

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    const sessionEvent = events.find((e) => e.type === "session");
    expect(sessionEvent).toBeDefined();
    expect(typeof sessionEvent.sessionId).toBe("string");
    expect(sessionEvent.sessionId.length).toBeGreaterThan(0);
  });

  it("reuses an existing session when sessionId is provided", async () => {
    const first = await request(app)
      .post("/api/builder/chat")
      .send({ message: "First message" });

    const { sessionId } = parseSSEEvents(first.text).find(
      (e) => e.type === "session"
    );

    const second = await request(app)
      .post("/api/builder/chat")
      .send({ message: "Second message", sessionId });

    const sessionEvent2 = parseSSEEvents(second.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent2.sessionId).toBe(sessionId);
  });

  it("DELETE /api/builder/session/:id clears the session", async () => {
    const chatRes = await request(app)
      .post("/api/builder/chat")
      .send({ message: "I want to delete this" });

    const sessionEvent = parseSSEEvents(chatRes.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent).toBeDefined();
    const { sessionId } = sessionEvent;

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
      .send({ message: "Hello" });

    expect(res.status).toBe(200);
    const sessionEvent = parseSSEEvents(res.text).find(
      (e) => e.type === "session"
    );
    expect(typeof sessionEvent.sessionId).toBe("string");
  });

  it("DELETE /api/user/session/:id clears the session", async () => {
    const chatRes = await request(app)
      .post("/api/user/chat")
      .send({ message: "Delete me" });

    const sessionEvent = parseSSEEvents(chatRes.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent).toBeDefined();
    const { sessionId } = sessionEvent;

    const delRes = await request(app).delete(
      `/api/user/session/${sessionId}`
    );
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ success: true });
  });
});
