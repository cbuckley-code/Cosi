import express from "express";
import { loadRegistry } from "./registry.js";
import { buildMcpServer, handleMcpRequest } from "./mcp-server.js";
import builderApi from "./builder-api.js";
import userApi from "./user-api.js";

const app = express();
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "cosi-orchestrator" });
});

// MCP streamable HTTP endpoint (external-facing)
app.post("/mcp", handleMcpRequest);

// Builder API
app.use("/api", builderApi);

// User chat API
app.use("/api/user", userApi);

// Also expose tool list via /api/tools directly from registry routes
// (already handled in builder-api.js as GET /api/tools)

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    console.log("[orchestrator] Loading tool registry...");
    await loadRegistry();

    console.log("[orchestrator] Building MCP server...");
    buildMcpServer();

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
