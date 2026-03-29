import { createApp } from "./app.js";

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    console.log("[orchestrator] Loading tool registry...");
    console.log("[orchestrator] Building MCP server...");
    const app = await createApp();
    app.listen(PORT, () => {
      console.log(`[orchestrator] Listening on port ${PORT}`);
      console.log(`[orchestrator] MCP endpoint: http://localhost:${PORT}/mcp`);
      console.log(`[orchestrator] Builder API: http://localhost:${PORT}/api`);
    });
  } catch (err) {
    console.error("[orchestrator] Startup error:", err);
    process.exit(1);
  }
}

start();
