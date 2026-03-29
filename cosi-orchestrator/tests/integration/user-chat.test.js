import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../src/bedrock-client.js", () => ({
  chatStream: vi.fn(async function* () {
    yield "I am ";
    yield "Cosi!";
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
import { parseSSEEvents, sseParser } from "../helpers/sse.js";

let app;

beforeAll(async () => {
  app = await createApp();
});

beforeEach(() => {
  vi.mocked(bedrockClient.chatStream).mockImplementation(async function* () {
    yield "I am ";
    yield "Cosi!";
  });
});

describe("POST /api/user/chat", () => {
  it("rejects requests missing the message field", async () => {
    const res = await request(app).post("/api/user/chat").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns text/event-stream content type", async () => {
    const res = await request(app)
      .post("/api/user/chat")
      .send({ message: "Who are you?" })
      .parse(sseParser);

    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
  });

  it("streams session → start → chunk(s) → done in order", async () => {
    const res = await request(app)
      .post("/api/user/chat")
      .send({ message: "Hello" })
      .parse(sseParser);

    const events = parseSSEEvents(res.body);
    const types = events.map((e) => e.type);

    expect(types.indexOf("session")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("start")).toBeGreaterThan(types.indexOf("session"));
    expect(types.lastIndexOf("done")).toBeGreaterThan(types.indexOf("start"));
    expect(types).toContain("chunk");
  });

  it("concatenates chunk text to form the full response", async () => {
    const res = await request(app)
      .post("/api/user/chat")
      .send({ message: "Hello" })
      .parse(sseParser);

    const fullText = parseSSEEvents(res.body)
      .filter((e) => e.type === "chunk")
      .map((e) => e.text)
      .join("");

    expect(fullText).toBe("I am Cosi!");
  });

  it("streams an error event when Bedrock throws", async () => {
    vi.mocked(bedrockClient.chatStream).mockImplementation(async function* () {
      throw new Error("Network error");
      yield "";
    });

    const res = await request(app)
      .post("/api/user/chat")
      .send({ message: "Hello" })
      .parse(sseParser);

    const errorEvent = parseSSEEvents(res.body).find(
      (e) => e.type === "error"
    );
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain("Network error");
  });

  it("passes attachments through to the chat stream", async () => {
    const callArgs = [];
    vi.mocked(bedrockClient.chatStream).mockImplementation(
      async function* (messages) {
        callArgs.push(messages);
        yield "Got it!";
      }
    );

    await request(app)
      .post("/api/user/chat")
      .send({
        message: "Look at this",
        attachments: [{ type: "text", name: "file.txt", content: "Hello" }],
      })
      .parse(sseParser);

    expect(callArgs.length).toBeGreaterThan(0);
    const lastMessage = callArgs[0].at(-1);
    expect(lastMessage.role).toBe("user");
  });
});
