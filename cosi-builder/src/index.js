import { startApi } from "./api.js";

const storageMode = process.env.STORAGE_MODE || "git";

console.log(`[cosi-builder] Starting builder sidecar (storage: ${storageMode})...`);

startApi();

if (storageMode === "filesystem") {
  const { startFsWatcher } = await import("./fs-watcher.js");
  startFsWatcher().catch((err) => {
    console.error("[cosi-builder] Fatal error:", err);
    process.exit(1);
  });
} else {
  const { startWatcher } = await import("./git-watcher.js");
  startWatcher().catch((err) => {
    console.error("[cosi-builder] Fatal error:", err);
    process.exit(1);
  });
}
