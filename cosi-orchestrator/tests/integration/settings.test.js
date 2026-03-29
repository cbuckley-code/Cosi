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
  // Preserve any existing settings
  try {
    originalSettings = await fs.readFile(SETTINGS_PATH, "utf8");
  } catch {
    originalSettings = null;
  }
});

afterAll(async () => {
  // Restore original settings
  if (originalSettings !== null) {
    await fs.writeFile(SETTINGS_PATH, originalSettings, "utf8");
  } else {
    await fs.unlink(SETTINGS_PATH).catch(() => {});
  }
});

describe("GET /api/settings", () => {
  it("returns 200 with default settings shape", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("gitRepoUrl");
    expect(res.body).toHaveProperty("gitBranch");
    expect(res.body).toHaveProperty("awsRegion");
    expect(res.body).toHaveProperty("bedrockModelId");
    expect(res.body).toHaveProperty("awsSecretPrefix");
    expect(typeof res.body.awsGovCloud).toBe("boolean");
  });
});

describe("POST /api/settings", () => {
  it("persists settings and returns success", async () => {
    const newSettings = {
      gitRepoUrl: "https://github.com/test/repo",
      gitBranch: "develop",
      awsRegion: "eu-west-1",
      awsGovCloud: false,
      bedrockModelId: "anthropic.claude-3-haiku-20240307-v1:0",
      awsSecretPrefix: "test/",
    };

    const postRes = await request(app)
      .post("/api/settings")
      .send(newSettings);
    expect(postRes.status).toBe(200);
    expect(postRes.body).toEqual({ success: true });

    const getRes = await request(app).get("/api/settings");
    expect(getRes.body.gitBranch).toBe("develop");
    expect(getRes.body.awsRegion).toBe("eu-west-1");
    expect(getRes.body.awsSecretPrefix).toBe("test/");
  });
});
