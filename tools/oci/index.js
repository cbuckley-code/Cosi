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
  const tenancy = process.env.COSI_SECRET_OCI_TENANCY_OCID;
  const user = process.env.COSI_SECRET_OCI_USER_OCID;
  const fingerprint = process.env.COSI_SECRET_OCI_FINGERPRINT;
  const privateKey = (process.env.COSI_SECRET_OCI_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const region = process.env.COSI_SECRET_OCI_REGION || "us-ashburn-1";

  if (!tenancy || !user || !fingerprint || !privateKey) {
    console.log("[oci] No credentials set — configure oci/* secrets to enable");
    return;
  }

  await mkdir("/root/.oci", { recursive: true });
  await writeFile("/root/.oci/key.pem", privateKey, { mode: 0o600 });

  const config = [
    "[DEFAULT]",
    `user=${user}`,
    `fingerprint=${fingerprint}`,
    `key_file=/root/.oci/key.pem`,
    `tenancy=${tenancy}`,
    `region=${region}`,
  ].join("\n");
  await writeFile("/root/.oci/config", config, { mode: 0o600 });
  console.log("[oci] Config written, region:", region);
}

function buildServer() {
  const server = new McpServer({ name: "oci", version: "1.0.0" });

  server.tool(
    "oci",
    "Run any OCI CLI command. Pass all arguments after 'oci' as an array.",
    { args: z.array(z.string()) },
    async ({ args }) => {
      const out = await run("oci", args);
      return { content: [{ type: "text", text: out }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "oci" }));
app.get("/mcp", (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

setup().then(() => app.listen(3000, () => console.log("[oci] listening on :3000")));
