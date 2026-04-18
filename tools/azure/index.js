import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { spawn } from "child_process";

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
  const tenantId = process.env.COSI_SECRET_AZURE_TENANT_ID;
  const clientId = process.env.COSI_SECRET_AZURE_CLIENT_ID;
  const clientSecret = process.env.COSI_SECRET_AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.COSI_SECRET_AZURE_SUBSCRIPTION_ID;

  if (!tenantId || !clientId || !clientSecret) {
    console.log("[azure] No credentials set — configure azure/* secrets to enable");
    return;
  }

  console.log("[azure] Authenticating service principal...");
  const loginOut = await run("az", [
    "login", "--service-principal",
    "-u", clientId, "-p", clientSecret, "--tenant", tenantId,
  ]);
  console.log("[azure] Login:", loginOut.split("\n")[0]);

  if (subscriptionId) {
    await run("az", ["account", "set", "--subscription", subscriptionId]);
    console.log("[azure] Subscription set:", subscriptionId);
  }
}

function buildServer() {
  const server = new McpServer({ name: "azure", version: "1.0.0" });

  server.tool(
    "az",
    "Run any Azure CLI command. Pass all arguments after 'az' as an array.",
    { args: z.array(z.string()) },
    async ({ args }) => {
      const out = await run("az", args);
      return { content: [{ type: "text", text: out }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "azure" }));
app.get("/mcp", (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

setup().then(() => app.listen(3000, () => console.log("[azure] listening on :3000")));
