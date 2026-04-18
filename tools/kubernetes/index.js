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
  const kubeconfig = (process.env.COSI_SECRET_KUBERNETES_KUBECONFIG || "").replace(/\\n/g, "\n");

  if (!kubeconfig) {
    console.log("[kubernetes] No kubeconfig set — configure kubernetes/kubeconfig secret to enable");
    return;
  }

  await mkdir("/root/.kube", { recursive: true });
  await writeFile("/root/.kube/config", kubeconfig, { mode: 0o600 });
  console.log("[kubernetes] Kubeconfig written");
}

function buildServer() {
  const server = new McpServer({ name: "kubernetes", version: "1.0.0" });

  server.tool(
    "kubectl",
    "Run any kubectl command. Pass all arguments after 'kubectl' as an array. Use stdin for apply -f -.",
    { args: z.array(z.string()), stdin: z.string().optional() },
    async ({ args, stdin }) => {
      const out = await run("kubectl", args, { stdin });
      return { content: [{ type: "text", text: out }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "kubernetes" }));
app.get("/mcp", (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

setup().then(() => app.listen(3000, () => console.log("[kubernetes] listening on :3000")));
