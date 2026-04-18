import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { spawn } from "child_process";

function run(args, { stdin } = {}) {
  return new Promise((resolve) => {
    const proc = spawn("gh", args, {
      env: { ...process.env },
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

function setup() {
  const token    = process.env.COSI_SECRET_GITHUB_TOKEN;
  const hostname = process.env.COSI_SECRET_GITHUB_HOSTNAME;

  if (token) {
    process.env.GH_TOKEN = token;
    console.log("[github] GH_TOKEN set");
  } else {
    console.log("[github] No token set — public repos only. Configure github/token to enable auth.");
  }

  if (hostname) {
    process.env.GH_HOST = hostname;
    console.log(`[github] GH_HOST set to ${hostname}`);
  }
}

function buildServer() {
  const server = new McpServer({ name: "github", version: "1.0.0" });

  server.tool(
    "gh",
    "Run any gh CLI command. Pass all arguments after 'gh' as an array.",
    { args: z.array(z.string()), stdin: z.string().optional() },
    async ({ args, stdin }) => {
      const out = await run(args, { stdin });
      return { content: [{ type: "text", text: out }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "github" }));
app.get("/mcp", (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

setup();
app.listen(3000, () => console.log("[github] listening on :3000"));
