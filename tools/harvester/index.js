import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import https from "https";

const SERVER = process.env.COSI_SECRET_HARVESTER_SERVER;
const TOKEN = process.env.COSI_SECRET_HARVESTER_TOKEN;

const agent = new https.Agent({ rejectUnauthorized: false });

async function hApi(path) {
  const resp = await fetch(`https://${SERVER}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    agent,
  });
  if (!resp.ok) throw new Error(`Harvester API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function hPost(path, body) {
  const resp = await fetch(`https://${SERVER}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    agent,
  });
  if (!resp.ok) throw new Error(`Harvester API ${resp.status}: ${await resp.text()}`);
  if (resp.status === 204) return null;
  return resp.json();
}

function vmPhase(vm) {
  return vm.status?.printableStatus || vm.status?.phase || "Unknown";
}

function buildServer() {
  const server = new McpServer({ name: "harvester", version: "1.0.0" });

  server.tool(
    "list_vms",
    "List virtual machines, optionally filtered by namespace",
    { namespace: z.string().optional() },
    async ({ namespace = "default" }) => {
      const data = await hApi(`/v1/harvester/kubevirt.io.virtualmachines/${namespace}`);
      const vms = (data.items || []).map((vm) => ({
        name: vm.metadata.name,
        namespace: vm.metadata.namespace,
        phase: vmPhase(vm),
        cpuCores: vm.spec?.template?.spec?.domain?.cpu?.cores,
        memory: vm.spec?.template?.spec?.domain?.resources?.requests?.memory,
        node: vm.status?.nodeName,
        created: vm.metadata.creationTimestamp,
      }));
      return { content: [{ type: "text", text: JSON.stringify(vms, null, 2) }] };
    }
  );

  server.tool(
    "manage_vm",
    "Start, stop, or restart a virtual machine",
    {
      namespace: z.string().optional(),
      name: z.string(),
      action: z.enum(["start", "stop", "restart"]),
    },
    async ({ namespace = "default", name, action }) => {
      const base = `/v1/harvester/kubevirt.io.virtualmachines/${namespace}/${encodeURIComponent(name)}`;
      if (action === "start") {
        await hPost(`${base}?action=start`, {});
      } else if (action === "stop") {
        await hPost(`${base}?action=stop`, {});
      } else {
        await hPost(`${base}?action=restart`, {});
      }
      return { content: [{ type: "text", text: JSON.stringify({ namespace, name, action, result: "success" }) }] };
    }
  );

  server.tool(
    "list_volumes",
    "List PersistentVolumeClaims (volumes) in Harvester",
    { namespace: z.string().optional() },
    async ({ namespace = "default" }) => {
      const data = await hApi(`/v1/harvester/persistentvolumeclaims/${namespace}`);
      const volumes = (data.items || []).map((pvc) => ({
        name: pvc.metadata.name,
        namespace: pvc.metadata.namespace,
        phase: pvc.status?.phase,
        storage: pvc.spec?.resources?.requests?.storage,
        storageClass: pvc.spec?.storageClassName,
        accessModes: pvc.spec?.accessModes,
        created: pvc.metadata.creationTimestamp,
      }));
      return { content: [{ type: "text", text: JSON.stringify(volumes, null, 2) }] };
    }
  );

  server.tool(
    "list_images",
    "List available VM images in Harvester",
    { namespace: z.string().optional() },
    async ({ namespace = "default" }) => {
      const data = await hApi(`/v1/harvester/harvesterhci.io.virtualmachineimages/${namespace}`);
      const images = (data.items || []).map((img) => ({
        name: img.metadata.name,
        namespace: img.metadata.namespace,
        displayName: img.spec?.displayName,
        url: img.spec?.url,
        phase: img.status?.progress === 100 ? "ready" : "downloading",
        size: img.status?.size,
        created: img.metadata.creationTimestamp,
      }));
      return { content: [{ type: "text", text: JSON.stringify(images, null, 2) }] };
    }
  );

  server.tool(
    "list_networks",
    "List VM networks (NetworkAttachmentDefinitions)",
    { namespace: z.string().optional() },
    async ({ namespace = "default" }) => {
      const data = await hApi(`/v1/harvester/k8s.cni.cncf.io.networkattachmentdefinitions/${namespace}`);
      const networks = (data.items || []).map((net) => ({
        name: net.metadata.name,
        namespace: net.metadata.namespace,
        vlanId: net.spec?.config ? JSON.parse(net.spec.config)?.vlanId : null,
        created: net.metadata.creationTimestamp,
      }));
      return { content: [{ type: "text", text: JSON.stringify(networks, null, 2) }] };
    }
  );

  server.tool(
    "get_cluster_nodes",
    "List Harvester cluster nodes with CPU, memory, and status",
    {},
    async () => {
      const data = await hApi("/v1/harvester/nodes");
      const nodes = (data.items || []).map((node) => {
        const conditions = node.status?.conditions || [];
        const ready = conditions.find((c) => c.type === "Ready")?.status === "True";
        return {
          name: node.metadata.name,
          ready,
          cpuCapacity: node.status?.capacity?.cpu,
          memoryCapacity: node.status?.capacity?.memory,
          cpuAllocatable: node.status?.allocatable?.cpu,
          memoryAllocatable: node.status?.allocatable?.memory,
          roles: Object.keys(node.metadata.labels || {})
            .filter((k) => k.startsWith("node-role.kubernetes.io/"))
            .map((k) => k.replace("node-role.kubernetes.io/", "")),
          kubeletVersion: node.status?.nodeInfo?.kubeletVersion,
        };
      });
      return { content: [{ type: "text", text: JSON.stringify(nodes, null, 2) }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "harvester" }));
app.get("/mcp", (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000, () => console.log("[harvester] listening on :3000"));
