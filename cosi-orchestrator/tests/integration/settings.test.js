import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createApp } from "../../src/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(__dirname, "../../../settings.json");

let app;
let originalSettings;

beforeAll(async () => {
  app = await createApp();
  try {
    originalSettings = await fs.readFile(SETTINGS_PATH, "utf8");
  } catch {
    originalSettings = null;
  }
});

afterAll(async () => {
  if (originalSettings !== null) {
    await fs.writeFile(SETTINGS_PATH, originalSettings, "utf8");
  } else {
    await fs.unlink(SETTINGS_PATH).catch(() => {});
  }
});

describe("GET /api/settings", () => {
  it("returns 200 with all expected fields", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("aiProvider");
    expect(res.body).toHaveProperty("storageMode");
    expect(res.body).toHaveProperty("gitRepoUrl");
    expect(res.body).toHaveProperty("gitBranch");
    expect(res.body).toHaveProperty("awsRegion");
    expect(res.body).toHaveProperty("bedrockModelId");
    expect(res.body).toHaveProperty("anthropicModelId");
    expect(res.body).toHaveProperty("azureOpenAiEndpoint");
    expect(res.body).toHaveProperty("azureOpenAiDeployment");
    expect(res.body).toHaveProperty("vertexModelId");
    expect(res.body).toHaveProperty("ociModelId");
    expect(typeof res.body.awsGovCloud).toBe("boolean");
  });

  it("defaults aiProvider to bedrock", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.body.aiProvider).toBe("bedrock");
  });
});

describe("POST /api/settings", () => {
  it("persists settings and returns success", async () => {
    const newSettings = {
      aiProvider: "anthropic",
      storageMode: "filesystem",
      gitRepoUrl: "https://github.com/test/repo",
      gitBranch: "develop",
      awsRegion: "eu-west-1",
      awsGovCloud: false,
      bedrockModelId: "us.anthropic.claude-sonnet-4-6",
      anthropicModelId: "claude-opus-4-7",
      azureOpenAiEndpoint: "",
      azureOpenAiDeployment: "gpt-4o",
      azureOpenAiApiVersion: "2025-01-01-preview",
      vertexModelId: "gemini-2.0-flash",
      ociGenAiEndpoint: "",
      ociCompartmentId: "",
      ociModelId: "meta.llama-3.3-70b-instruct",
    };

    const postRes = await request(app).post("/api/settings").send(newSettings);
    expect(postRes.status).toBe(200);
    expect(postRes.body).toEqual({ success: true });

    const getRes = await request(app).get("/api/settings");
    expect(getRes.body.aiProvider).toBe("anthropic");
    expect(getRes.body.anthropicModelId).toBe("claude-opus-4-7");
    expect(getRes.body.gitBranch).toBe("develop");
    expect(getRes.body.awsRegion).toBe("eu-west-1");
  });
});
