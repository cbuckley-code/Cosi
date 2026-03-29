import express from "express";
import { loadRegistry } from "./registry.js";
import { buildMcpServer, handleMcpRequest } from "./mcp-server.js";
import builderApi from "./builder-api.js";
import userApi from "./user-api.js";

export async function createApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "cosi-orchestrator" });
  });

  app.post("/mcp", handleMcpRequest);
  app.use("/api", builderApi);
  app.use("/api/user", userApi);

  await loadRegistry();
  buildMcpServer();

  return app;
}
