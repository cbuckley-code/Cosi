import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Mock global fetch before importing the module
vi.stubGlobal("fetch", vi.fn());
afterAll(() => vi.unstubAllGlobals());

const { validateGeneratedTool } = await import("../../src/tool-validator.js");

const BUILDER_URL = process.env.BUILDER_URL || "http://cosi-builder:3001";

describe("validateGeneratedTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when fetch throws (builder unreachable)", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await validateGeneratedTool("my-tool", { "index.js": "..." });
    expect(result).toBeNull();
  });

  it("returns null when fetch returns non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
    });
    const result = await validateGeneratedTool("my-tool", { "index.js": "..." });
    expect(result).toBeNull();
  });

  it("returns null when fetch returns 404", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
    });
    const result = await validateGeneratedTool("my-tool", {});
    expect(result).toBeNull();
  });

  it("returns validation result on success: { success: true }", async () => {
    const validationResult = { success: true, logs: ["Build OK", "Health check passed"] };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(validationResult),
    });
    const result = await validateGeneratedTool("my-tool", { "index.js": "console.log('hi')" });
    expect(result).toEqual(validationResult);
    expect(result.success).toBe(true);
  });

  it("returns validation result on failure: { success: false, error, logs }", async () => {
    const validationResult = {
      success: false,
      error: "Build failed: missing dependency",
      logs: ["Step 1: OK", "Step 2: FAILED"],
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(validationResult),
    });
    const result = await validateGeneratedTool("bad-tool", { "index.js": "import x from 'missing'" });
    expect(result).toEqual(validationResult);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Build failed: missing dependency");
    expect(result.logs).toEqual(["Step 1: OK", "Step 2: FAILED"]);
  });

  it("sends POST request to /validate endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    await validateGeneratedTool("test-tool", {});
    expect(fetch).toHaveBeenCalledWith(
      `${BUILDER_URL}/validate`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends correct toolName in request body", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    await validateGeneratedTool("specific-tool-name", { "file.js": "content" });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.toolName).toBe("specific-tool-name");
  });

  it("sends correct files in request body", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    const files = {
      "index.js": "module.exports = {}",
      "package.json": '{"name":"test"}',
    };
    await validateGeneratedTool("my-tool", files);

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.files).toEqual(files);
  });

  it("sends Content-Type: application/json header", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    await validateGeneratedTool("my-tool", {});

    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(options.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("includes AbortSignal with timeout in the request", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    await validateGeneratedTool("my-tool", {});

    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(options.signal).toBeDefined();
  });

  it("returns null when fetch throws a timeout/abort error", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    vi.mocked(fetch).mockRejectedValue(abortError);

    const result = await validateGeneratedTool("slow-tool", {});
    expect(result).toBeNull();
  });
});
