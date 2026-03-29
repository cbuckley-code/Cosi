import express from "express";
import { validateTool } from "./tool-validator.js";

const PORT = parseInt(process.env.API_PORT || "3001", 10);

export function startApi() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "cosi-builder" });
  });

  /**
   * POST /validate
   * Body: { toolName: string, files: { [filename]: string } }
   * Response: { success: boolean, logs: string[], error?: string }
   *
   * Builds the tool image, starts a container, runs health + MCP checks
   * from inside the container, then tears everything down.
   */
  app.post("/validate", async (req, res) => {
    const { toolName, files } = req.body || {};

    if (!toolName || !files || typeof files !== "object") {
      return res.status(400).json({ error: "toolName and files are required" });
    }

    console.log(`[builder-api] Validating tool: ${toolName}`);

    try {
      const result = await validateTool(toolName, files);
      console.log(
        `[builder-api] Validation ${result.success ? "passed" : "FAILED"} for ${toolName}`
      );
      res.json(result);
    } catch (err) {
      console.error(`[builder-api] Unexpected validation error:`, err);
      res.status(500).json({ success: false, logs: [], error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`[builder-api] Listening on port ${PORT}`);
  });
}
