import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import https from "https";

const VSPHERE_SERVER = process.env.COSI_SECRET_VSPHERE_SERVER;
const VSPHERE_USERNAME = process.env.COSI_SECRET_VSPHERE_USERNAME;
const VSPHERE_PASSWORD = process.env.COSI_SECRET_VSPHERE_PASSWORD;

const agent = new https.Agent({ rejectUnauthorized: false });

let sessionId = null;
let sessionExpiry = 0;

async function getSession() {
  if (sessionId && Date.now() < sessionExpiry) return sessionId;

  const resp = await fetch(`https://${VSPHERE_SERVER}/api/session`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${VSPHERE_USERNAME}:${VSPHERE_PASSWORD}`).toString("base64")}`,
    },
    // @ts-ignore — node-fetch / native fetch both accept dispatcher-like agent
    agent,
  });

  if (!resp.ok) throw new Error(`vSphere auth failed: ${resp.status}`);
  sessionId = (await resp.json()).replace(/"/g, "");
  sessionExpiry = Date.now() + 20 * 60 * 1000; // 20 min
  return sessionId;
}

async function vsApi(path, method = "GET", body) {
  const token = await getSession();
  const opts = {
    method,
    headers: { "vmware-api-session-id": token, "Content-Type": "application/json" },
    agent,
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`https://${VSPHERE_SERVER}/api${path}`, opts);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`vSphere API ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

function buildServer() {
  const server = new McpServer({ name: "vsphere", version: "1.0.0" });

  server.tool(
    "list_vms",
    "List virtual machines, optionally filtered by power state or name",
    {
      powerState: z.enum(["POWERED_ON", "POWERED_OFF", "SUSPENDED"]).optional(),
      nameFilter: z.string().optional(),
    },
    async ({ powerState, nameFilter }) => {
      const params = new URLSearchParams();
      if (powerState) params.set("power_states", powerState);
      const vms = await vsApi(`/vcenter/vm?${params}`);
      const filtered = nameFilter
        ? vms.filter((v) => v.name?.toLowerCase().includes(nameFilter.toLowerCase()))
        : vms;
      const result = filtered.map((v) => ({
        vm: v.vm,
        name: v.name,
        powerState: v.power_state,
        cpuCount: v.cpu_count,
        memorySize: v.memory_size_MiB,
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_vm",
    "Get detailed information about a specific virtual machine",
    { vmId: z.string() },
    async ({ vmId }) => {
      const vm = await vsApi(`/vcenter/vm/${encodeURIComponent(vmId)}`);
      return { content: [{ type: "text", text: JSON.stringify(vm, null, 2) }] };
    }
  );

  server.tool(
    "manage_vm_power",
    "Power on, power off, suspend, or reset a virtual machine",
    {
      vmId: z.string(),
      action: z.enum(["start", "stop", "suspend", "reset"]),
    },
    async ({ vmId, action }) => {
      const actionMap = { start: "start", stop: "stop", suspend: "suspend", reset: "reset" };
      await vsApi(`/vcenter/vm/${encodeURIComponent(vmId)}/power?action=${actionMap[action]}`, "POST");
      return { content: [{ type: "text", text: JSON.stringify({ vmId, action, result: "success" }) }] };
    }
  );

  server.tool(
    "list_hosts",
    "List all ESXi hosts in the vSphere environment",
    {},
    async () => {
      const hosts = await vsApi("/vcenter/host");
      const result = hosts.map((h) => ({
        host: h.host,
        name: h.name,
        connectionState: h.connection_state,
        powerState: h.power_state,
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "list_datastores",
    "List all datastores with capacity and free space information",
    {},
    async () => {
      const datastores = await vsApi("/vcenter/datastore");
      const result = datastores.map((d) => ({
        datastore: d.datastore,
        name: d.name,
        type: d.type,
        freeSpaceGB: d.free_space ? (d.free_space / 1073741824).toFixed(1) : null,
        capacityGB: d.capacity ? (d.capacity / 1073741824).toFixed(1) : null,
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "list_resource_pools",
    "List resource pools in the vSphere inventory",
    {},
    async () => {
      const pools = await vsApi("/vcenter/resource-pool");
      const result = pools.map((p) => ({
        resourcePool: p.resource_pool,
        name: p.name,
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "vsphere" }));
app.get("/mcp", (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000, () => console.log("[vsphere] listening on :3000"));
