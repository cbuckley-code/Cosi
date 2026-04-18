import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// Mock tool-validator so no real Docker calls are made.
vi.mock("../../src/tool-validator.js", () => ({
  validateTool: vi.fn(async () => ({ success: true, logs: [] })),
}));

// Import the Express app after mocking its dependency.
const { app } = await import("../../src/api.js");
const { validateTool } = await import("../../src/tool-validator.js");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns 200 with status ok and service name", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "cosi-builder" });
  });
});

describe("POST /validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with validateTool result when toolName and files provided", async () => {
    validateTool.mockResolvedValueOnce({ success: true, logs: ["Build OK"] });

    const res = await request(app)
      .post("/validate")
      .send({ toolName: "my-tool", files: { "Dockerfile": "FROM node:20" } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, logs: ["Build OK"] });
    expect(validateTool).toHaveBeenCalledOnce();
    expect(validateTool).toHaveBeenCalledWith("my-tool", { "Dockerfile": "FROM node:20" });
  });

  it("returns 400 when toolName is missing", async () => {
    const res = await request(app)
      .post("/validate")
      .send({ files: { "Dockerfile": "FROM node:20" } });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(validateTool).not.toHaveBeenCalled();
  });

  it("returns 400 when files is missing", async () => {
    const res = await request(app)
      .post("/validate")
      .send({ toolName: "my-tool" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(validateTool).not.toHaveBeenCalled();
  });

  it("returns 400 when files is not an object", async () => {
    const res = await request(app)
      .post("/validate")
      .send({ toolName: "my-tool", files: "not-an-object" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(validateTool).not.toHaveBeenCalled();
  });

  it("returns 400 when body is empty", async () => {
    const res = await request(app).post("/validate").send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(validateTool).not.toHaveBeenCalled();
  });

  it("returns 500 with error message when validateTool throws", async () => {
    validateTool.mockRejectedValueOnce(new Error("Docker socket unavailable"));

    const res = await request(app)
      .post("/validate")
      .send({ toolName: "bad-tool", files: { "Dockerfile": "FROM node:20" } });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      logs: [],
      error: "Docker socket unavailable",
    });
  });

  it("returns 200 with failed result when validateTool resolves with success:false", async () => {
    validateTool.mockResolvedValueOnce({
      success: false,
      logs: ["Health check failed"],
      error: "Health check did not pass within 30s",
    });

    const res = await request(app)
      .post("/validate")
      .send({ toolName: "broken-tool", files: { "Dockerfile": "FROM node:20" } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: false,
      error: "Health check did not pass within 30s",
    });
  });
});
