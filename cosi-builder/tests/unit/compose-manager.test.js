import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

// Mock child_process.execFile so no real Docker calls are made.
// The mock must be hoisted before any imports that pull in compose-manager.
vi.mock("child_process", () => ({
  execFile: vi.fn((cmd, args, cb) => cb(null, "", "")),
}));

// Import after mocking so the module under test picks up the mock.
const { updateCompose } = await import("../../src/compose-manager.js");
const { execFile } = await import("child_process");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cosi-test-"));
  await fs.mkdir(path.join(dir, "tools"), { recursive: true });
  return dir;
}

async function addTool(workspace, toolName, manifest) {
  const toolDir = path.join(workspace, "tools", toolName);
  await fs.mkdir(toolDir, { recursive: true });
  await fs.writeFile(
    path.join(toolDir, "tool.json"),
    JSON.stringify(manifest),
    "utf8"
  );
}

async function readGeneratedCompose(workspace) {
  const raw = await fs.readFile(
    path.join(workspace, "docker-compose.tools.yml"),
    "utf8"
  );
  return yaml.load(raw.replace(/^#.*\n/, "")); // strip header comment
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateCompose", () => {
  let workspace;

  beforeEach(async () => {
    workspace = await makeTmpWorkspace();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("empty tools dir → generates compose with empty services, no docker compose up", async () => {
    await updateCompose(workspace);

    const doc = await readGeneratedCompose(workspace);
    expect(doc.services).toEqual({});
    expect(execFile).not.toHaveBeenCalled();
  });

  it("single tool with no secrets → correct service entry, no environment key", async () => {
    await addTool(workspace, "my-tool", { secrets: [] });

    await updateCompose(workspace);

    const doc = await readGeneratedCompose(workspace);
    expect(doc.services["tool-my-tool"]).toMatchObject({
      image: "cosi-tool-my-tool:latest",
      container_name: "cosi-tool-my-tool",
      networks: ["cosi-network"],
      restart: "unless-stopped",
    });
    expect(doc.services["tool-my-tool"].environment).toBeUndefined();
  });

  it("tool with secrets → COSI_SECRET_* env entries with hyphens→underscores, uppercase", async () => {
    await addTool(workspace, "weather", {
      secrets: ["api-key", "some/nested-secret"],
    });

    await updateCompose(workspace);

    const doc = await readGeneratedCompose(workspace);
    const env = doc.services["tool-weather"].environment;
    expect(env).toContain("COSI_SECRET_API_KEY=${COSI_SECRET_API_KEY:-}");
    expect(env).toContain(
      "COSI_SECRET_SOME_NESTED_SECRET=${COSI_SECRET_SOME_NESTED_SECRET:-}"
    );
  });

  it("multiple tools → all appear as services in compose output", async () => {
    await addTool(workspace, "alpha", { secrets: [] });
    await addTool(workspace, "beta", { secrets: ["token"] });

    await updateCompose(workspace);

    const doc = await readGeneratedCompose(workspace);
    expect(Object.keys(doc.services)).toContain("tool-alpha");
    expect(Object.keys(doc.services)).toContain("tool-beta");
    expect(doc.services["tool-alpha"].image).toBe("cosi-tool-alpha:latest");
    expect(doc.services["tool-beta"].image).toBe("cosi-tool-beta:latest");
  });

  it("dir without tool.json is skipped", async () => {
    // Create a subdir with no tool.json
    await fs.mkdir(path.join(workspace, "tools", "no-manifest"), {
      recursive: true,
    });
    await addTool(workspace, "real-tool", { secrets: [] });

    await updateCompose(workspace);

    const doc = await readGeneratedCompose(workspace);
    expect(Object.keys(doc.services)).not.toContain("tool-no-manifest");
    expect(Object.keys(doc.services)).toContain("tool-real-tool");
  });

  it("when secrets.env exists → --env-file flag included in docker compose call", async () => {
    await addTool(workspace, "myservice", { secrets: [] });
    const secretsFile = path.join(workspace, "secrets.env");
    await fs.writeFile(secretsFile, "FOO=bar\n", "utf8");

    await updateCompose(workspace);

    expect(execFile).toHaveBeenCalledOnce();
    const [cmd, args] = execFile.mock.calls[0];
    expect(cmd).toBe("docker");
    expect(args).toContain("--env-file");
    const envFileIndex = args.indexOf("--env-file");
    expect(args[envFileIndex + 1]).toBe(secretsFile);
  });

  it("when secrets.env absent → no --env-file flag in docker compose call", async () => {
    await addTool(workspace, "myservice", { secrets: [] });
    // Ensure secrets.env does NOT exist
    await fs.rm(path.join(workspace, "secrets.env"), { force: true });

    await updateCompose(workspace);

    expect(execFile).toHaveBeenCalledOnce();
    const [, args] = execFile.mock.calls[0];
    expect(args).not.toContain("--env-file");
  });
});
