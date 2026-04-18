import simpleGit from "simple-git";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = process.env.REPO_DIR || path.join(__dirname, "../../");

const git = simpleGit(REPO_DIR);

export async function configureGit() {
  try {
    await git.addConfig("user.email", "cosi@cosi.local");
    await git.addConfig("user.name", "Cosi Orchestrator");
  } catch (err) {
    console.warn("[git] Could not configure git user:", err.message);
  }
}

export function isGitMode() {
  return (process.env.STORAGE_MODE || "git") === "git";
}

export async function commitAndPush(toolName, message) {
  if (!isGitMode()) {
    console.log("[git] Filesystem mode — skipping commit");
    return;
  }

  await configureGit();
  const toolPath = `tools/${toolName}`;

  try {
    await git.add(`${toolPath}/.`);
    const status = await git.status();
    if (status.staged.length === 0) {
      console.log("[git] Nothing to commit");
      return;
    }
    await git.commit(message || `feat: add tool ${toolName}`);
    const branch = process.env.GIT_BRANCH || "main";
    await git.push("origin", branch);
    console.log(`[git] Committed and pushed tool ${toolName}`);
  } catch (err) {
    console.error("[git] Error committing:", err.message);
    throw err;
  }
}

export async function getStatus() {
  try {
    const status = await git.status();
    return status;
  } catch (err) {
    console.error("[git] Error getting status:", err.message);
    return null;
  }
}
