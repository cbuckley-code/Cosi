import fs from "fs/promises";
import path from "path";
import { buildTool } from "./docker-builder.js";
import { updateCompose } from "./compose-manager.js";

const WORKSPACE = process.env.WORKSPACE || "/workspace";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "5000", 10);

// toolName -> mtime of its tool.json
const seen = new Map();

async function restartOrchestrator() {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const exec = promisify(execFile);

  try {
    console.log("[fs-watcher] Restarting orchestrator...");
    await exec("docker", [
      "compose",
      "-f", `${WORKSPACE}/docker-compose.yml`,
      "-f", `${WORKSPACE}/docker-compose.tools.yml`,
      "restart", "orchestrator",
    ]);
    console.log("[fs-watcher] Orchestrator restarted");
  } catch (err) {
    console.error("[fs-watcher] Failed to restart orchestrator:", err.message);
  }
}

async function pollForChanges() {
  const toolsDir = path.join(WORKSPACE, "tools");

  let entries;
  try {
    entries = await fs.readdir(toolsDir, { withFileTypes: true });
  } catch {
    return;
  }

  const changedTools = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const toolName = entry.name;
    const manifestPath = path.join(toolsDir, toolName, "tool.json");

    try {
      const stat = await fs.stat(manifestPath);
      const mtime = stat.mtimeMs;

      if (!seen.has(toolName) || seen.get(toolName) !== mtime) {
        changedTools.push(toolName);
        seen.set(toolName, mtime);
      }
    } catch {
      // No tool.json yet — skip
    }
  }

  if (changedTools.length === 0) return;

  console.log(`[fs-watcher] Changed tools: ${changedTools.join(", ")}`);

  for (const toolName of changedTools) {
    const manifestPath = path.join(toolsDir, toolName, "tool.json");
    let enabled = true;
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      enabled = JSON.parse(raw).enabled !== false;
    } catch {}

    if (!enabled) {
      console.log(`[fs-watcher] Tool ${toolName} is disabled — skipping build`);
      continue;
    }

    try {
      await buildTool(toolName, WORKSPACE);
    } catch (err) {
      console.error(`[fs-watcher] Failed to build ${toolName}:`, err.message);
    }
  }

  await updateCompose(WORKSPACE);
  await restartOrchestrator();
}

export async function startFsWatcher() {
  console.log(`[fs-watcher] Starting filesystem watcher, polling every ${POLL_INTERVAL}ms`);

  // Initial scan — populate seen map without building (tools already exist)
  const toolsDir = path.join(WORKSPACE, "tools");
  try {
    const entries = await fs.readdir(toolsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(toolsDir, entry.name, "tool.json");
      try {
        const stat = await fs.stat(manifestPath);
        seen.set(entry.name, stat.mtimeMs);
      } catch {}
    }
    console.log(`[fs-watcher] Initial scan: ${seen.size} existing tool(s)`);
    await updateCompose(WORKSPACE);
  } catch {}

  setInterval(pollForChanges, POLL_INTERVAL);
}
