import { startWatcher } from "./git-watcher.js";
import { startApi } from "./api.js";

console.log("[cosi-builder] Starting builder sidecar...");

startApi();

startWatcher().catch((err) => {
  console.error("[cosi-builder] Fatal error:", err);
  process.exit(1);
});
