import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { InstancesClient, ZonesClient } from "@google-cloud/compute";
import { ClusterManagerClient } from "@google-cloud/container";
import { Storage } from "@google-cloud/storage";

const DEFAULT_PROJECT = process.env.COSI_SECRET_GCP_PROJECT_ID;
const CREDENTIALS_JSON = process.env.COSI_SECRET_GCP_CREDENTIALS_JSON;

function gcpAuth() {
  if (CREDENTIALS_JSON) {
    return { credentials: JSON.parse(CREDENTIALS_JSON) };
  }
  return {};
}

function buildServer() {
  const server = new McpServer({ name: "gcp", version: "1.0.0" });

  server.tool(
    "list_compute_instances",
    "List Compute Engine VM instances across zones in a project",
    { project: z.string().optional(), zone: z.string().optional() },
    async ({ project, zone }) => {
      const proj = project || DEFAULT_PROJECT;
      const client = new InstancesClient(gcpAuth());
      const instances = [];

      if (zone) {
        const [list] = await client.list({ project: proj, zone });
        for (const i of list) {
          instances.push({
            name: i.name,
            zone: i.zone?.split("/").pop(),
            status: i.status,
            machineType: i.machineType?.split("/").pop(),
            networkIp: i.networkInterfaces?.[0]?.networkIP,
            natIp: i.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP,
          });
        }
      } else {
        const [agg] = await client.aggregatedList({ project: proj });
        for (const [, zoneData] of Object.entries(agg)) {
          for (const i of zoneData.instances || []) {
            instances.push({
              name: i.name,
              zone: i.zone?.split("/").pop(),
              status: i.status,
              machineType: i.machineType?.split("/").pop(),
              networkIp: i.networkInterfaces?.[0]?.networkIP,
            });
          }
        }
      }

      return { content: [{ type: "text", text: JSON.stringify(instances, null, 2) }] };
    }
  );

  server.tool(
    "manage_compute_instance",
    "Start, stop, or reset a Compute Engine VM instance",
    {
      project: z.string().optional(),
      zone: z.string(),
      instance: z.string(),
      action: z.enum(["start", "stop", "reset"]),
    },
    async ({ project, zone, instance, action }) => {
      const proj = project || DEFAULT_PROJECT;
      const client = new InstancesClient(gcpAuth());
      const params = { project: proj, zone, instance };
      if (action === "start") await client.start(params);
      else if (action === "stop") await client.stop(params);
      else await client.reset(params);
      return { content: [{ type: "text", text: JSON.stringify({ instance, action, result: "success" }) }] };
    }
  );

  server.tool(
    "get_compute_instance",
    "Get details of a specific Compute Engine VM instance",
    { project: z.string().optional(), zone: z.string(), instance: z.string() },
    async ({ project, zone, instance }) => {
      const proj = project || DEFAULT_PROJECT;
      const client = new InstancesClient(gcpAuth());
      const [vm] = await client.get({ project: proj, zone, instance });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: vm.name,
            status: vm.status,
            machineType: vm.machineType?.split("/").pop(),
            zone: vm.zone?.split("/").pop(),
            cpuPlatform: vm.cpuPlatform,
            creationTimestamp: vm.creationTimestamp,
            disks: vm.disks?.map((d) => ({ name: d.source?.split("/").pop(), boot: d.boot, sizeGb: d.diskSizeGb })),
            networkInterfaces: vm.networkInterfaces?.map((n) => ({
              network: n.network?.split("/").pop(),
              ip: n.networkIP,
              natIp: n.accessConfigs?.[0]?.natIP,
            })),
            tags: vm.labels,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "list_gke_clusters",
    "List GKE Kubernetes clusters in a project",
    { project: z.string().optional(), location: z.string().optional() },
    async ({ project, location }) => {
      const proj = project || DEFAULT_PROJECT;
      const client = new ClusterManagerClient(gcpAuth());
      const parent = `projects/${proj}/locations/${location || "-"}`;
      const [resp] = await client.listClusters({ parent });
      const clusters = (resp.clusters || []).map((c) => ({
        name: c.name,
        location: c.location,
        status: c.status,
        currentMasterVersion: c.currentMasterVersion,
        nodeCount: c.currentNodeCount,
        endpoint: c.endpoint,
      }));
      return { content: [{ type: "text", text: JSON.stringify(clusters, null, 2) }] };
    }
  );

  server.tool(
    "describe_gke_cluster",
    "Get details of a GKE cluster including version, node pools, and status",
    { project: z.string().optional(), location: z.string(), clusterName: z.string() },
    async ({ project, location, clusterName }) => {
      const proj = project || DEFAULT_PROJECT;
      const client = new ClusterManagerClient(gcpAuth());
      const name = `projects/${proj}/locations/${location}/clusters/${clusterName}`;
      const [cluster] = await client.getCluster({ name });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: cluster.name,
            status: cluster.status,
            currentMasterVersion: cluster.currentMasterVersion,
            endpoint: cluster.endpoint,
            nodePools: cluster.nodePools?.map((p) => ({
              name: p.name,
              status: p.status,
              initialNodeCount: p.initialNodeCount,
              machineType: p.config?.machineType,
            })),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "list_storage_buckets",
    "List Cloud Storage buckets in a project",
    { project: z.string().optional() },
    async ({ project }) => {
      const proj = project || DEFAULT_PROJECT;
      const storage = new Storage({ ...gcpAuth(), projectId: proj });
      const [buckets] = await storage.getBuckets();
      const list = buckets.map((b) => ({
        name: b.name,
        location: b.metadata?.location,
        storageClass: b.metadata?.storageClass,
        created: b.metadata?.timeCreated,
      }));
      return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
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

app.listen(3000, () => console.log("[gcp] listening on :3000"));
