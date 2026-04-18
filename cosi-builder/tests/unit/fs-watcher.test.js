import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs/promises";
import path from "path";

// Mock dependencies before importing the module under test.
vi.mock("../../src/docker-builder.js", () => ({
  buildTool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/compose-manager.js", () => ({
  updateCompose: vi.fn().mockResolvedValue(undefined),
}));

// Also mock child_process so restartOrchestrator doesn't try real docker calls.
vi.mock("child_process", () => ({
  execFile: vi.fn((cmd, args, cb) => cb(null, "", "")),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cosi-fswatcher-test-"));
  await fs.mkdir(path.join(dir, "tools"), { recursive: true });
  return dir;
}

async function addTool(workspace, toolName, manifest = { secrets: [] }) {
  const toolDir = path.join(workspace, "tools", toolName);
  await fs.mkdir(toolDir, { recursive: true });
  await fs.writeFile(
    path.join(toolDir, "tool.json"),
    JSON.stringify(manifest),
    "utf8"
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startFsWatcher", () => {
  let workspace;
  let updateCompose;
  let buildTool;

  beforeEach(async () => {
    workspace = await makeTmpWorkspace();
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Set WORKSPACE env var so the module picks up our temp dir.
    process.env.WORKSPACE = workspace;

    // Re-import mocks each time to get the current mock references.
    const composeMod = await import("../../src/compose-manager.js");
    const builderMod = await import("../../src/docker-builder.js");
    updateCompose = composeMod.updateCompose;
    buildTool = builderMod.buildTool;
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.resetModules();
    delete process.env.WORKSPACE;
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("on start with existing tools: populates seen map and calls updateCompose, not buildTool", async () => {
    await addTool(workspace, "existing-tool");

    // Re-import the watcher module fresh so it reads the current WORKSPACE.
    vi.resetModules();
    // Re-apply mocks after resetModules.
    vi.mock("../../src/docker-builder.js", () => ({
      buildTool: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("../../src/compose-manager.js", () => ({
      updateCompose: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("child_process", () => ({
      execFile: vi.fn((cmd, args, cb) => cb(null, "", "")),
    }));

    const { startFsWatcher } = await import("../../src/fs-watcher.js");
    const composeMod = await import("../../src/compose-manager.js");
    const builderMod = await import("../../src/docker-builder.js");

    await startFsWatcher();

    expect(composeMod.updateCompose).toHaveBeenCalledOnce();
    expect(composeMod.updateCompose).toHaveBeenCalledWith(workspace);
    expect(builderMod.buildTool).not.toHaveBeenCalled();
  });

  it("when tool.json mtime changes between polls: buildTool is called for that tool", async () => {
    await addTool(workspace, "watched-tool");

    vi.resetModules();
    vi.mock("../../src/docker-builder.js", () => ({
      buildTool: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("../../src/compose-manager.js", () => ({
      updateCompose: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("child_process", () => ({
      execFile: vi.fn((cmd, args, cb) => cb(null, "", "")),
    }));

    const { startFsWatcher } = await import("../../src/fs-watcher.js");
    const builderMod = await import("../../src/docker-builder.js");
    const composeMod = await import("../../src/compose-manager.js");

    await startFsWatcher();

    // Initial call happened during startup — clear the mock counts.
    vi.clearAllMocks();

    // Update the tool.json mtime by rewriting it.
    const manifestPath = path.join(workspace, "tools", "watched-tool", "tool.json");
    await fs.writeFile(manifestPath, JSON.stringify({ secrets: [] }), "utf8");

    // Advance fake timers to fire the setInterval.
    // advanceTimersByTimeAsync fires the interval callback but cannot await
    // real fs I/O (libuv callbacks) that runs inside pollForChanges.
    // Switch to real timers, then wait briefly for the I/O chain to complete.
    vi.advanceTimersByTime(6000);
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(builderMod.buildTool).toHaveBeenCalledWith("watched-tool", workspace);
    expect(composeMod.updateCompose).toHaveBeenCalledWith(workspace);
  });

  it("when tool.json does not change between polls: buildTool is not called again", async () => {
    await addTool(workspace, "stable-tool");

    vi.resetModules();
    vi.mock("../../src/docker-builder.js", () => ({
      buildTool: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("../../src/compose-manager.js", () => ({
      updateCompose: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("child_process", () => ({
      execFile: vi.fn((cmd, args, cb) => cb(null, "", "")),
    }));

    const { startFsWatcher } = await import("../../src/fs-watcher.js");
    const builderMod = await import("../../src/docker-builder.js");

    await startFsWatcher();
    vi.clearAllMocks();

    // Advance time without touching the file.
    await vi.advanceTimersByTimeAsync(6000);

    expect(builderMod.buildTool).not.toHaveBeenCalled();
  });

  it("on start with no tools dir: does not throw and does not call buildTool", async () => {
    // Remove the tools dir entirely.
    await fs.rm(path.join(workspace, "tools"), { recursive: true, force: true });

    vi.resetModules();
    vi.mock("../../src/docker-builder.js", () => ({
      buildTool: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("../../src/compose-manager.js", () => ({
      updateCompose: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("child_process", () => ({
      execFile: vi.fn((cmd, args, cb) => cb(null, "", "")),
    }));

    const { startFsWatcher } = await import("../../src/fs-watcher.js");
    const builderMod = await import("../../src/docker-builder.js");

    await expect(startFsWatcher()).resolves.not.toThrow();
    expect(builderMod.buildTool).not.toHaveBeenCalled();
  });
});
