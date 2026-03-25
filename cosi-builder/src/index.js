import { startWatcher } from "./git-watcher.js";

console.log("[cosi-builder] Starting builder sidecar...");

startWatcher().catch((err) => {
  console.error("[cosi-builder] Fatal error:", err);
  process.exit(1);
});
