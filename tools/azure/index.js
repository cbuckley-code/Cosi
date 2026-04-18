import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ClientSecretCredential } from "@azure/identity";
import { ComputeManagementClient } from "@azure/arm-compute";
import { ContainerServiceClient } from "@azure/arm-containerservice";
import { ResourceManagementClient } from "@azure/arm-resources";

const SUBSCRIPTION_ID = process.env.COSI_SECRET_AZURE_SUBSCRIPTION_ID;
const TENANT_ID = process.env.COSI_SECRET_AZURE_TENANT_ID;
const CLIENT_ID = process.env.COSI_SECRET_AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.COSI_SECRET_AZURE_CLIENT_SECRET;

function credential() {
  return new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
}

function buildServer() {
  const server = new McpServer({ name: "azure", version: "1.0.0" });

  server.tool(
    "list_resource_groups",
    "List all resource groups in the subscription",
    {},
    async () => {
      const client = new ResourceManagementClient(credential(), SUBSCRIPTION_ID);
      const groups = [];
      for await (const rg of client.resourceGroups.list()) {
        groups.push({ name: rg.name, location: rg.location, tags: rg.tags });
      }
      return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
    }
  );

  server.tool(
    "list_virtual_machines",
    "List virtual machines, optionally filtered by resource group",
    { resourceGroup: z.string().optional() },
    async ({ resourceGroup }) => {
      const client = new ComputeManagementClient(credential(), SUBSCRIPTION_ID);
      const vms = [];
      const iter = resourceGroup
        ? client.virtualMachines.list(resourceGroup)
        : client.virtualMachines.listAll();
      for await (const vm of iter) {
        vms.push({
          name: vm.name,
          location: vm.location,
          size: vm.hardwareProfile?.vmSize,
          os: vm.storageProfile?.osDisk?.osType,
          provisioningState: vm.provisioningState,
          resourceGroup: vm.id?.split("/")[4],
        });
      }
      return { content: [{ type: "text", text: JSON.stringify(vms, null, 2) }] };
    }
  );

  server.tool(
    "get_vm_instance_view",
    "Get detailed status and instance view for a virtual machine",
    { resourceGroup: z.string(), vmName: z.string() },
    async ({ resourceGroup, vmName }) => {
      const client = new ComputeManagementClient(credential(), SUBSCRIPTION_ID);
      const view = await client.virtualMachines.instanceView(resourceGroup, vmName);
      const statuses = view.statuses?.map((s) => ({ code: s.code, displayStatus: s.displayStatus }));
      return { content: [{ type: "text", text: JSON.stringify({ vmName, statuses }, null, 2) }] };
    }
  );

  server.tool(
    "manage_virtual_machine",
    "Start, stop, deallocate, or restart a virtual machine",
    {
      resourceGroup: z.string(),
      vmName: z.string(),
      action: z.enum(["start", "stop", "deallocate", "restart"]),
    },
    async ({ resourceGroup, vmName, action }) => {
      const client = new ComputeManagementClient(credential(), SUBSCRIPTION_ID);
      if (action === "start") await client.virtualMachines.beginStartAndWait(resourceGroup, vmName);
      else if (action === "stop") await client.virtualMachines.beginPowerOffAndWait(resourceGroup, vmName);
      else if (action === "deallocate") await client.virtualMachines.beginDeallocateAndWait(resourceGroup, vmName);
      else await client.virtualMachines.beginRestartAndWait(resourceGroup, vmName);
      return { content: [{ type: "text", text: JSON.stringify({ vmName, action, result: "success" }) }] };
    }
  );

  server.tool(
    "list_aks_clusters",
    "List AKS Kubernetes clusters, optionally filtered by resource group",
    { resourceGroup: z.string().optional() },
    async ({ resourceGroup }) => {
      const client = new ContainerServiceClient(credential(), SUBSCRIPTION_ID);
      const clusters = [];
      const iter = resourceGroup
        ? client.managedClusters.listByResourceGroup(resourceGroup)
        : client.managedClusters.list();
      for await (const c of iter) {
        clusters.push({
          name: c.name,
          location: c.location,
          kubernetesVersion: c.kubernetesVersion,
          provisioningState: c.provisioningState,
          fqdn: c.fqdn,
          resourceGroup: c.id?.split("/")[4],
        });
      }
      return { content: [{ type: "text", text: JSON.stringify(clusters, null, 2) }] };
    }
  );

  server.tool(
    "describe_aks_cluster",
    "Get details of an AKS cluster including Kubernetes version, node pools, and FQDN",
    { resourceGroup: z.string(), clusterName: z.string() },
    async ({ resourceGroup, clusterName }) => {
      const client = new ContainerServiceClient(credential(), SUBSCRIPTION_ID);
      const cluster = await client.managedClusters.get(resourceGroup, clusterName);
      const nodePools = cluster.agentPoolProfiles?.map((p) => ({
        name: p.name,
        count: p.count,
        vmSize: p.vmSize,
        osType: p.osType,
        mode: p.mode,
      }));
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: cluster.name,
            kubernetesVersion: cluster.kubernetesVersion,
            provisioningState: cluster.provisioningState,
            fqdn: cluster.fqdn,
            nodePools,
          }, null, 2),
        }],
      };
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

app.listen(3000, () => console.log("[azure] listening on :3000"));
