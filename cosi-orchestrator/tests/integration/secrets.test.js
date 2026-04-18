import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import fs from "fs/promises";
import { createApp } from "../../src/app.js";

const SECRETS_PATH = process.env.SECRETS_PATH;

let app;

beforeAll(async () => {
  app = await createApp();
});

beforeEach(async () => {
  // Start each test with a clean secrets file
  await fs.unlink(SECRETS_PATH).catch(() => {});
});

afterAll(async () => {
  await fs.unlink(SECRETS_PATH).catch(() => {});
});

describe("GET /api/secrets", () => {
  it("returns 200 with an empty array when no secrets are configured", async () => {
    const res = await request(app).get("/api/secrets");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("secrets");
    expect(Array.isArray(res.body.secrets)).toBe(true);
    expect(res.body.secrets).toHaveLength(0);
  });

  it("returns the names (not values) of stored secrets", async () => {
    await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_MY_KEY", value: "super-secret-value" });

    const res = await request(app).get("/api/secrets");
    expect(res.body.secrets).toContain("COSI_SECRET_MY_KEY");
    expect(JSON.stringify(res.body)).not.toContain("super-secret-value");
  });
});

describe("POST /api/secrets", () => {
  it("creates a new secret and returns success", async () => {
    const res = await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_API_KEY", value: "abc123" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("the secret name then appears in GET /api/secrets", async () => {
    await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_TOKEN", value: "tok" });

    const res = await request(app).get("/api/secrets");
    expect(res.body.secrets).toContain("COSI_SECRET_TOKEN");
  });

  it("updating an existing secret does not create a duplicate", async () => {
    await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_DUP", value: "first" });
    await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_DUP", value: "second" });

    const res = await request(app).get("/api/secrets");
    const count = res.body.secrets.filter((s) => s === "COSI_SECRET_DUP").length;
    expect(count).toBe(1);
  });

  it("stores multiple secrets independently", async () => {
    await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_A", value: "val-a" });
    await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_B", value: "val-b" });

    const res = await request(app).get("/api/secrets");
    expect(res.body.secrets).toContain("COSI_SECRET_A");
    expect(res.body.secrets).toContain("COSI_SECRET_B");
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/secrets")
      .send({ value: "some-value" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when value is missing", async () => {
    const res = await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_X" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is empty", async () => {
    const res = await request(app).post("/api/secrets").send({});
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/secrets/:name", () => {
  it("removes a secret and it no longer appears in GET", async () => {
    await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_DELETE_ME", value: "bye" });

    const del = await request(app).delete("/api/secrets/COSI_SECRET_DELETE_ME");
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });

    const res = await request(app).get("/api/secrets");
    expect(res.body.secrets).not.toContain("COSI_SECRET_DELETE_ME");
  });

  it("only removes the targeted secret, leaving others intact", async () => {
    await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_KEEP", value: "kept" });
    await request(app)
      .post("/api/secrets")
      .send({ name: "COSI_SECRET_REMOVE", value: "gone" });

    await request(app).delete("/api/secrets/COSI_SECRET_REMOVE");

    const res = await request(app).get("/api/secrets");
    expect(res.body.secrets).toContain("COSI_SECRET_KEEP");
    expect(res.body.secrets).not.toContain("COSI_SECRET_REMOVE");
  });

  it("returns 200 even when the secret does not exist", async () => {
    const res = await request(app).delete(
      "/api/secrets/COSI_SECRET_DOES_NOT_EXIST"
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
