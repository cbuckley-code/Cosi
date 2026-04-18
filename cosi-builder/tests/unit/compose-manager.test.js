import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import yaml from "js-yaml";

// Must be hoisted above the import of compose-manager so the mock is in place
// when the module evaluates `const execAsync = promisify(execFile)`.
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "child_process";
import { updateCompose } from "../../src/compose-manager.js";

// Helper: create a temp workspace with tool fixtures
async function makeWorkspace(tools = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cosi-compose-"));
  const toolsDir = path.join(dir, "tools");
  await fs.mkdir(toolsDir);
  for (const [name, manifest] of Object.entries(tools)) {
    const toolDir = path.join(toolsDir, name);
    await fs.mkdir(toolDir);
    await fs.writeFile(path.join(toolDir, "tool.json"), JSON.stringify(manifest));
  }
  return dir;
}

beforeEach(() => {
  // Default: docker compose succeeds
  execFile.mockImplementation((bin, args, callback) => {
    callback(null, "", "");
  });
});

afterEach(async () => {
  vi.clearAllMocks();
});

describe("updateCompose() — tool filtering", () => {
  it("includes enabled tools in the compose file", async () => {
    const workspace = await makeWorkspace({
      "my-tool": { name: "my-tool", enabled: true, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    const parsed = yaml.load(content);
    expect(parsed.services).toHaveProperty("tool-my-tool");

    await fs.rm(workspace, { recursive: true });
  });

  it("skips tools with enabled: false", async () => {
    const workspace = await makeWorkspace({
      "disabled-tool": { name: "disabled-tool", enabled: false, tools: [], secrets: [] },
      "enabled-tool": { name: "enabled-tool", enabled: true, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    const parsed = yaml.load(content);
    expect(parsed.services).toHaveProperty("tool-enabled-tool");
    expect(parsed.services).not.toHaveProperty("tool-disabled-tool");

    await fs.rm(workspace, { recursive: true });
  });

  it("treats tools without an enabled field as enabled", async () => {
    const workspace = await makeWorkspace({
      "implicit": { name: "implicit", tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    const parsed = yaml.load(content);
    expect(parsed.services).toHaveProperty("tool-implicit");

    await fs.rm(workspace, { recursive: true });
  });

  it("produces an empty services map when all tools are disabled", async () => {
    const workspace = await makeWorkspace({
      "off": { name: "off", enabled: false, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    const parsed = yaml.load(content);
    expect(Object.keys(parsed.services)).toHaveLength(0);

    await fs.rm(workspace, { recursive: true });
  });
});

describe("updateCompose() — generated YAML structure", () => {
  it("sets image name to cosi-tool-{name}:latest", async () => {
    const workspace = await makeWorkspace({
      "my-tool": { name: "my-tool", enabled: true, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    const parsed = yaml.load(content);
    expect(parsed.services["tool-my-tool"].image).toBe("cosi-tool-my-tool:latest");

    await fs.rm(workspace, { recursive: true });
  });

  it("sets container_name to cosi-tool-{name}", async () => {
    const workspace = await makeWorkspace({
      "xtool": { name: "xtool", enabled: true, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    const parsed = yaml.load(content);
    expect(parsed.services["tool-xtool"].container_name).toBe("cosi-tool-xtool");

    await fs.rm(workspace, { recursive: true });
  });

  it("attaches services to the cosi-network", async () => {
    const workspace = await makeWorkspace({
      "net-tool": { name: "net-tool", enabled: true, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    const parsed = yaml.load(content);
    expect(parsed.services["tool-net-tool"].networks).toContain("cosi-network");
    expect(parsed.networks).toHaveProperty("cosi-network");

    await fs.rm(workspace, { recursive: true });
  });

  it("converts secret names to COSI_SECRET_ environment variables", async () => {
    const workspace = await makeWorkspace({
      "aws-tool": {
        name: "aws-tool",
        enabled: true,
        tools: [],
        secrets: ["aws/access-key-id", "aws/secret-access-key"],
      },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    expect(content).toContain("COSI_SECRET_AWS_ACCESS_KEY_ID");
    expect(content).toContain("COSI_SECRET_AWS_SECRET_ACCESS_KEY");

    await fs.rm(workspace, { recursive: true });
  });

  it("omits environment block for tools with no secrets", async () => {
    const workspace = await makeWorkspace({
      "no-secrets": { name: "no-secrets", enabled: true, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    const parsed = yaml.load(content);
    expect(parsed.services["tool-no-secrets"]).not.toHaveProperty("environment");

    await fs.rm(workspace, { recursive: true });
  });

  it("includes the auto-generated header comment", async () => {
    const workspace = await makeWorkspace({
      "t": { name: "t", enabled: true, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const content = await fs.readFile(
      path.join(workspace, "docker-compose.tools.yml"),
      "utf8"
    );
    expect(content).toContain("Auto-generated by cosi-builder");

    await fs.rm(workspace, { recursive: true });
  });
});

describe("updateCompose() — docker compose invocation", () => {
  it("calls docker compose with --remove-orphans", async () => {
    const workspace = await makeWorkspace({
      "t": { name: "t", enabled: true, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    expect(execFile).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["--remove-orphans"]),
      expect.any(Function)
    );

    await fs.rm(workspace, { recursive: true });
  });

  it("passes --env-file when secrets.env exists", async () => {
    const workspace = await makeWorkspace({
      "t": { name: "t", enabled: true, tools: [], secrets: ["t/key"] },
    });
    const secretsFile = path.join(workspace, "secrets.env");
    await fs.writeFile(secretsFile, "COSI_SECRET_T_KEY=val\n");

    await updateCompose(workspace);

    expect(execFile).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["--env-file", secretsFile]),
      expect.any(Function)
    );

    await fs.rm(workspace, { recursive: true });
  });

  it("does not pass --env-file when secrets.env is absent", async () => {
    const workspace = await makeWorkspace({
      "t": { name: "t", enabled: true, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const calls = execFile.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const args = calls[0][1];
    expect(args).not.toContain("--env-file");

    await fs.rm(workspace, { recursive: true });
  });

  it("does not call docker compose when all tools are disabled", async () => {
    const workspace = await makeWorkspace({
      "off": { name: "off", enabled: false, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    expect(execFile).not.toHaveBeenCalled();

    await fs.rm(workspace, { recursive: true });
  });

  it("still writes the compose file even when no tools are enabled", async () => {
    const workspace = await makeWorkspace({
      "off": { name: "off", enabled: false, tools: [], secrets: [] },
    });

    await updateCompose(workspace);

    const composePath = path.join(workspace, "docker-compose.tools.yml");
    await expect(fs.access(composePath)).resolves.toBeUndefined();

    await fs.rm(workspace, { recursive: true });
  });
});
