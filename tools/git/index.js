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
  const username  = process.env.COSI_SECRET_GIT_USERNAME;
  const token     = process.env.COSI_SECRET_GIT_TOKEN;
  const userName  = process.env.COSI_SECRET_GIT_USER_NAME;
  const userEmail = process.env.COSI_SECRET_GIT_USER_EMAIL;
  const sshKey    = (process.env.COSI_SECRET_GIT_SSH_KEY || "").replace(/\\n/g, "\n");

  if (userName)  await run("git", ["config", "--global", "user.name",  userName]);
  if (userEmail) await run("git", ["config", "--global", "user.email", userEmail]);

  // Disable interactive prompts — fail fast when credentials are missing
  await run("git", ["config", "--global", "core.askPass", ""]);
  process.env.GIT_TERMINAL_PROMPT = "0";

  if (username && token) {
    const netrc = [
      `machine github.com login ${username} password ${token}`,
      `machine gitlab.com login ${username} password ${token}`,
      `machine bitbucket.org login ${username} password ${token}`,
    ].join("\n") + "\n";
    await writeFile("/root/.netrc", netrc, { mode: 0o600 });
    console.log("[git] .netrc written for HTTPS auth (github, gitlab, bitbucket)");
  }

  if (sshKey) {
    await mkdir("/root/.ssh", { recursive: true });
    await writeFile("/root/.ssh/id_rsa", sshKey, { mode: 0o600 });
    await writeFile("/root/.ssh/config",
      "Host *\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n",
      { mode: 0o600 }
    );
    console.log("[git] SSH key written");
  }

  if (!username && !token && !sshKey) {
    console.log("[git] No credentials set — public repos only. Configure git/* secrets to enable auth.");
  }
}

function buildServer() {
  const server = new McpServer({ name: "git", version: "1.0.0" });

  server.tool(
    "git",
    "Run any git command. Pass all arguments after 'git' as an array.",
    { args: z.array(z.string()), stdin: z.string().optional() },
    async ({ args, stdin }) => {
      const out = await run("git", args, { stdin });
      return { content: [{ type: "text", text: out }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "git" }));
app.get("/mcp", (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

setup().then(() => app.listen(3000, () => console.log("[git] listening on :3000")));
