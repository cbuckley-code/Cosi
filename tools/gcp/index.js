import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { spawn } from "child_process";
import { writeFile, mkdir } from "fs/promises";

function run(binary, args, { env = {}, stdin } = {}) {
  return new Promise((resolve) => {
    const proc = spawn(binary, args, {
      env: { ...process.env, ...env },
      timeout: 120_000,
    });
    let out = "";
    proc.stdout.on("data", (d) => { out += d; });
    proc.stderr.on("data", (d) => { out += d; });
    proc.stdin.end(stdin ?? "");
    proc.on("close", (code) => resolve(code !== 0 ? `Exit ${code}:\n${out}` : out || "(no output)"));
    proc.on("error", (e) => resolve(`Error: ${e.message}`));
  });
}

async function setup() {
  const credJson = process.env.COSI_SECRET_GCP_CREDENTIALS_JSON;
  const projectId = process.env.COSI_SECRET_GCP_PROJECT_ID;

  if (!credJson) {
    console.log("[gcp] No credentials set — configure gcp/* secrets to enable");
    return;
  }

  await mkdir("/tmp/gcp", { recursive: true });
  await writeFile("/tmp/gcp/key.json", credJson, { mode: 0o600 });

  console.log("[gcp] Activating service account...");
  const authOut = await run("gcloud", [
    "auth", "activate-service-account", "--key-file=/tmp/gcp/key.json",
  ]);
  console.log("[gcp] Auth:", authOut.split("\n")[0]);

  if (projectId) {
    await run("gcloud", ["config", "set", "project", projectId]);
    console.log("[gcp] Project set:", projectId);
  }
}

function buildServer() {
  const server = new McpServer({ name: "gcp", version: "1.0.0" });

  server.tool(
    "gcloud",
    "Run any gcloud CLI command. Pass all arguments after 'gcloud' as an array.",
    { args: z.array(z.string()) },
    async ({ args }) => {
      const out = await run("gcloud", args);
      return { content: [{ type: "text", text: out }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "gcp" }));
app.get("/mcp", (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

setup().then(() => app.listen(3000, () => console.log("[gcp] listening on :3000")));
