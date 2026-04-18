import { vi, describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";

vi.mock("../../src/bedrock-client.js", () => ({
  chatStream: vi.fn(async function* () {
    yield "Hello from builder!";
  }),
  chat: vi.fn(async () => "Compacted summary"),
  getModelId: vi.fn(() => "test-model"),
  reinitialize: vi.fn(),
}));

vi.mock("../../src/git-client.js", () => ({
  commitAndPush: vi.fn(),
  isGitMode: vi.fn(() => false),
}));

vi.mock("../../src/tool-generator.js", () => ({
  generateTool: vi.fn(),
  writeToolFiles: vi.fn(),
  toolExists: vi.fn(async () => false),
}));

vi.mock("../../src/tool-validator.js", () => ({
  validateGeneratedTool: vi.fn(async () => null),
}));

// Secrets module: use real implementation but redirect to a temp file via
// the in-module SECRETS_FILE constant. Because the constant is read at module
// load time we control it by mocking the module and delegating to real fs so
// that the secrets CRUD behaviour is exercised in full.
import os from "os";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// SETTINGS_PATH mirrors the constant inside builder-api.js
const SETTINGS_PATH = path.join(__dirname, "../../../settings.json");

// --- Secrets module mock ---
// We keep a simple in-memory store so the secrets tests exercise the route
// layer (validation, success/error responses) without touching the filesystem.
const _secretsStore = new Map();

vi.mock("../../src/secrets.js", () => ({
  getSecret: vi.fn(async (name) => _secretsStore.get(name) ?? null),
  setSecret: vi.fn(async (name, value) => { _secretsStore.set(name, value); }),
  deleteSecret: vi.fn(async (name) => { _secretsStore.delete(name); }),
  listSecretNames: vi.fn(async () => Array.from(_secretsStore.keys())),
  reinitialize: vi.fn(),
}));

import request from "supertest";
import * as bedrockClient from "../../src/bedrock-client.js";
import { createApp } from "../../src/app.js";
import { parseSSEEvents } from "../helpers/sse.js";

let app;
let originalSettings;

beforeAll(async () => {
  app = await createApp();

  // Preserve any existing settings.json so we can restore it after the suite
  try {
    originalSettings = await fs.readFile(SETTINGS_PATH, "utf8");
  } catch {
    originalSettings = null;
  }
});

afterAll(async () => {
  // Restore settings.json to its pre-test state
  if (originalSettings !== null) {
    await fs.writeFile(SETTINGS_PATH, originalSettings, "utf8");
  } else {
    await fs.unlink(SETTINGS_PATH).catch(() => {});
  }
});

beforeEach(() => {
  vi.mocked(bedrockClient.chatStream).mockImplementation(async function* () {
    yield "Hello from builder!";
  });
  // Reset the in-memory secrets store before each test for isolation
  _secretsStore.clear();
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe("GET /api/settings", () => {
  it("returns 200 with expected shape", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("storageMode");
    expect(res.body).toHaveProperty("gitRepoUrl");
    expect(res.body).toHaveProperty("gitBranch");
    expect(res.body).toHaveProperty("awsRegion");
    expect(res.body).toHaveProperty("bedrockModelId");
    expect(typeof res.body.awsGovCloud).toBe("boolean");
  });
});

describe("POST /api/settings", () => {
  it("persists settings and returns { success: true }", async () => {
    const newSettings = {
      storageMode: "git",
      gitRepoUrl: "https://github.com/example/repo",
      gitBranch: "main",
      awsRegion: "us-east-1",
      awsGovCloud: false,
      bedrockModelId: "anthropic.claude-3-haiku-20240307-v1:0",
    };

    const postRes = await request(app).post("/api/settings").send(newSettings);
    expect(postRes.status).toBe(200);
    expect(postRes.body).toEqual({ success: true });

    const getRes = await request(app).get("/api/settings");
    expect(getRes.status).toBe(200);
    expect(getRes.body.storageMode).toBe("git");
    expect(getRes.body.gitBranch).toBe("main");
    expect(getRes.body.awsRegion).toBe("us-east-1");
    expect(getRes.body.bedrockModelId).toBe(
      "anthropic.claude-3-haiku-20240307-v1:0"
    );
  });

  it("updates process.env for known keys after POST", async () => {
    const newSettings = {
      storageMode: "filesystem",
      awsRegion: "eu-central-1",
      bedrockModelId: "some.model-id",
      gitRepoUrl: "https://github.com/example/env-test",
      gitBranch: "develop",
    };

    await request(app).post("/api/settings").send(newSettings);

    expect(process.env.STORAGE_MODE).toBe("filesystem");
    expect(process.env.AWS_REGION).toBe("eu-central-1");
    expect(process.env.BEDROCK_MODEL_ID).toBe("some.model-id");
    expect(process.env.GIT_REPO_URL).toBe("https://github.com/example/env-test");
    expect(process.env.GIT_BRANCH).toBe("develop");
  });
});

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

describe("GET /api/secrets", () => {
  it("returns { secrets: [] } when no secrets are stored", async () => {
    const res = await request(app).get("/api/secrets");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ secrets: [] });
  });
});

describe("POST /api/secrets", () => {
  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/secrets")
      .send({ value: "somevalue" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 { success: true } when name and value are provided", async () => {
    const res = await request(app)
      .post("/api/secrets")
      .send({ name: "MY_API_KEY", value: "s3cr3t" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("secret appears in subsequent GET after POST", async () => {
    await request(app)
      .post("/api/secrets")
      .send({ name: "MY_API_KEY", value: "s3cr3t" });

    const res = await request(app).get("/api/secrets");
    expect(res.status).toBe(200);
    expect(res.body.secrets).toContain("MY_API_KEY");
  });
});

describe("DELETE /api/secrets/:name", () => {
  it("returns 200 { success: true }", async () => {
    // Add a secret first so there is something to delete
    await request(app)
      .post("/api/secrets")
      .send({ name: "TO_DELETE", value: "bye" });

    const res = await request(app).delete("/api/secrets/TO_DELETE");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("secret no longer appears in GET after DELETE", async () => {
    await request(app)
      .post("/api/secrets")
      .send({ name: "EPHEMERAL_SECRET", value: "temp" });

    await request(app).delete("/api/secrets/EPHEMERAL_SECRET");

    const res = await request(app).get("/api/secrets");
    expect(res.body.secrets).not.toContain("EPHEMERAL_SECRET");
  });
});

// ---------------------------------------------------------------------------
// Builder chat
// ---------------------------------------------------------------------------

describe("POST /api/builder/chat", () => {
  it("rejects requests missing the message field", async () => {
    const res = await request(app).post("/api/builder/chat").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns text/event-stream content type", async () => {
    const res = await request(app)
      .post("/api/builder/chat")
      .send({ message: "Help me build a tool" });

    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
  });

  it("streams session → start → chunk(s) → done events in order", async () => {
    const res = await request(app)
      .post("/api/builder/chat")
      .send({ message: "Help me build a tool" });

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

  it("includes a UUID sessionId in the session event", async () => {
    const res = await request(app)
      .post("/api/builder/chat")
      .send({ message: "Help me build a tool" });

    const sessionEvent = parseSSEEvents(res.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent).toBeDefined();
    expect(sessionEvent.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("echoes back a provided sessionId", async () => {
    const sessionId = "12345678-1234-1234-1234-123456789abc";
    const res = await request(app)
      .post("/api/builder/chat")
      .send({ message: "Help me build a tool", sessionId });

    const sessionEvent = parseSSEEvents(res.text).find(
      (e) => e.type === "session"
    );
    expect(sessionEvent).toBeDefined();
    expect(sessionEvent.sessionId).toBe(sessionId);
  });

  it("streams an error event when chatStream throws", async () => {
    vi.mocked(bedrockClient.chatStream).mockImplementation(async function* () {
      throw new Error("Builder Bedrock error");
      yield "";
    });

    const res = await request(app)
      .post("/api/builder/chat")
      .send({ message: "Help me build a tool" });

    const errorEvent = parseSSEEvents(res.text).find(
      (e) => e.type === "error"
    );
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain("Builder Bedrock error");
  });
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

describe("GET /api/tools", () => {
  it("returns { tools: [] } when no tools are registered", async () => {
    const res = await request(app).get("/api/tools");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tools");
    expect(Array.isArray(res.body.tools)).toBe(true);
    // With no tool directories under TOOLS_DIR=/tmp/cosi-test-tools the
    // registry stays empty.
    expect(res.body.tools).toHaveLength(0);
  });
});
