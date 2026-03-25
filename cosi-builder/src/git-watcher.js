import simpleGit from "simple-git";
import { buildTool } from "./docker-builder.js";
import { updateCompose } from "./compose-manager.js";

const WORKSPACE = process.env.WORKSPACE || "/workspace";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "5000", 10);

const git = simpleGit(WORKSPACE);

let lastSeenHash = null;

async function configureGit() {
  try {
    await git.addConfig("user.email", "cosi-builder@cosi.local");
    await git.addConfig("user.name", "Cosi Builder");
  } catch {}
}

/**
 * Parse tool directories from a git diff output.
 */
function parseChangedTools(diffOutput) {
  const changedTools = new Set();
  const lines = diffOutput.split("\n").filter(Boolean);

  for (const line of lines) {
    // Match tools/<tool-name>/...
    const match = line.match(/^tools\/([^/]+)\//);
    if (match) {
      changedTools.add(match[1]);
    }
  }

  return Array.from(changedTools);
}

async function restartOrchestrator() {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const exec = promisify(execFile);

  try {
    console.log("[git-watcher] Restarting orchestrator...");
    await exec("docker", [
      "compose",
      "-f",
      `${WORKSPACE}/docker-compose.yml`,
      "-f",
      `${WORKSPACE}/docker-compose.tools.yml`,
      "restart",
      "orchestrator",
    ]);
    console.log("[git-watcher] Orchestrator restarted");
  } catch (err) {
    console.error("[git-watcher] Failed to restart orchestrator:", err.message);
  }
}

async function pollForChanges() {
  try {
    // Pull latest
    await git.pull();

    // Get current HEAD
    const log = await git.log({ maxCount: 1 });
    if (!log.latest) return;

    const currentHash = log.latest.hash;

    // First run — record hash and update compose without building
    if (!lastSeenHash) {
      console.log(`[git-watcher] Initial commit hash: ${currentHash}`);
      lastSeenHash = currentHash;
      // Still update compose to pick up any existing tools
      await updateCompose(WORKSPACE);
      return;
    }

    // No change
    if (currentHash === lastSeenHash) return;

    console.log(`[git-watcher] Detected change: ${lastSeenHash.slice(0, 8)} → ${currentHash.slice(0, 8)}`);

    // Get changed files between last seen and current
    let diff;
    try {
      diff = await git.diff([lastSeenHash, currentHash, "--name-only", "--", "tools/"]);
    } catch (err) {
      console.warn("[git-watcher] Could not diff, using empty diff:", err.message);
      diff = "";
    }

    const changedTools = parseChangedTools(diff);
    console.log(`[git-watcher] Changed tools: ${changedTools.join(", ") || "none"}`);

    // Build each changed tool
    for (const toolName of changedTools) {
      try {
        await buildTool(toolName, WORKSPACE);
      } catch (err) {
        console.error(`[git-watcher] Failed to build ${toolName}:`, err.message);
      }
    }

    // Update lastSeenHash
    lastSeenHash = currentHash;

    // Update compose and restart if there were changes
    if (changedTools.length > 0) {
      await updateCompose(WORKSPACE);
      await restartOrchestrator();
    }
  } catch (err) {
    console.error("[git-watcher] Poll error:", err.message);
  }
}

export async function startWatcher() {
  await configureGit();
  console.log(`[git-watcher] Starting, polling every ${POLL_INTERVAL}ms`);

  // Initial poll
  await pollForChanges();

  // Periodic polling
  setInterval(pollForChanges, POLL_INTERVAL);
}
