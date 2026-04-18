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

function buildServer() {
  const server = new McpServer({ name: "aws", version: "1.0.0" });

  server.tool(
    "aws",
    "Run any AWS CLI command. Pass all arguments after 'aws' as an array.",
    { args: z.array(z.string()) },
    async ({ args }) => {
      const out = await run("aws", args, {
        env: {
          AWS_ACCESS_KEY_ID: process.env.COSI_SECRET_AWS_ACCESS_KEY_ID || "",
          AWS_SECRET_ACCESS_KEY: process.env.COSI_SECRET_AWS_SECRET_ACCESS_KEY || "",
          AWS_DEFAULT_REGION: process.env.COSI_SECRET_AWS_REGION || "us-east-1",
        },
      });
      return { content: [{ type: "text", text: out }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "aws" }));
app.get("/mcp", (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000, () => console.log("[aws] listening on :3000"));
