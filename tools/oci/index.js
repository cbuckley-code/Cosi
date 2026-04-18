import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createSign } from "crypto";

const TENANCY = process.env.COSI_SECRET_OCI_TENANCY_OCID;
const USER = process.env.COSI_SECRET_OCI_USER_OCID;
const FINGERPRINT = process.env.COSI_SECRET_OCI_FINGERPRINT;
const PRIVATE_KEY = (process.env.COSI_SECRET_OCI_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const REGION = process.env.COSI_SECRET_OCI_REGION || "us-ashburn-1";

function endpoint(service) {
  return `https://${service}.${REGION}.oraclecloud.com`;
}

function signRequest(method, url, body) {
  const parsed = new URL(url);
  const date = new Date().toUTCString();
  const requestTarget = `${method.toLowerCase()} ${parsed.pathname}${parsed.search}`;

  let signingString = `date: ${date}\n(request-target): ${requestTarget}\nhost: ${parsed.hostname}`;
  const headers = { date, host: parsed.hostname };

  if (body && method !== "GET") {
    const digest = `SHA-256=${Buffer.from(body).toString("base64")}`;
    signingString += `\ncontent-length: ${Buffer.byteLength(body)}\ncontent-type: application/json\nx-content-sha256: ${digest}`;
    headers["content-length"] = String(Buffer.byteLength(body));
    headers["content-type"] = "application/json";
    headers["x-content-sha256"] = digest;
  }

  const sign = createSign("RSA-SHA256");
  sign.update(signingString);
  const signature = sign.sign(PRIVATE_KEY, "base64");

  const signedHeaders = body && method !== "GET"
    ? "date (request-target) host content-length content-type x-content-sha256"
    : "date (request-target) host";

  headers.authorization = `Signature version="1",keyId="${TENANCY}/${USER}/${FINGERPRINT}",algorithm="rsa-sha256",headers="${signedHeaders}",signature="${signature}"`;
  return headers;
}

async function ociGet(url) {
  const headers = signRequest("GET", url, null);
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`OCI API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function ociPost(url, body) {
  const bodyStr = JSON.stringify(body);
  const headers = signRequest("POST", url, bodyStr);
  const resp = await fetch(url, { method: "POST", headers, body: bodyStr });
  if (!resp.ok) throw new Error(`OCI API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

function buildServer() {
  const server = new McpServer({ name: "oci", version: "1.0.0" });

  server.tool(
    "list_compartments",
    "List all compartments in the tenancy",
    {},
    async () => {
      const url = `${endpoint("identity")}/20160918/compartments?compartmentId=${encodeURIComponent(TENANCY)}&compartmentIdInSubtree=true`;
      const data = await ociGet(url);
      const compartments = data.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        lifecycleState: c.lifecycleState,
      }));
      return { content: [{ type: "text", text: JSON.stringify(compartments, null, 2) }] };
    }
  );

  server.tool(
    "list_instances",
    "List compute instances in a compartment",
    {
      compartmentId: z.string().optional(),
      availabilityDomain: z.string().optional(),
    },
    async ({ compartmentId, availabilityDomain }) => {
      const cid = compartmentId || TENANCY;
      let url = `${endpoint("iaas")}/20160918/instances?compartmentId=${encodeURIComponent(cid)}`;
      if (availabilityDomain) url += `&availabilityDomain=${encodeURIComponent(availabilityDomain)}`;
      const data = await ociGet(url);
      const instances = data.map((i) => ({
        id: i.id,
        displayName: i.displayName,
        lifecycleState: i.lifecycleState,
        shape: i.shape,
        availabilityDomain: i.availabilityDomain,
        timeCreated: i.timeCreated,
      }));
      return { content: [{ type: "text", text: JSON.stringify(instances, null, 2) }] };
    }
  );

  server.tool(
    "manage_instance",
    "Start, stop, reset, or soft-stop a compute instance",
    {
      instanceId: z.string(),
      action: z.enum(["start", "stop", "reset", "softstop"]),
    },
    async ({ instanceId, action }) => {
      const ociAction = { start: "START", stop: "STOP", reset: "RESET", softstop: "SOFTSTOP" }[action];
      const url = `${endpoint("iaas")}/20160918/instances/${encodeURIComponent(instanceId)}?action=${ociAction}`;
      const data = await ociPost(url, {});
      return { content: [{ type: "text", text: JSON.stringify({ instanceId, action, lifecycleState: data.lifecycleState }) }] };
    }
  );

  server.tool(
    "list_oke_clusters",
    "List OKE Kubernetes clusters in a compartment",
    { compartmentId: z.string().optional() },
    async ({ compartmentId }) => {
      const cid = compartmentId || TENANCY;
      const url = `${endpoint("containerengine")}/20180222/clusters?compartmentId=${encodeURIComponent(cid)}`;
      const data = await ociGet(url);
      const clusters = data.map((c) => ({
        id: c.id,
        name: c.name,
        kubernetesVersion: c.kubernetesVersion,
        lifecycleState: c.lifecycleState,
        vcnId: c.vcnId,
      }));
      return { content: [{ type: "text", text: JSON.stringify(clusters, null, 2) }] };
    }
  );

  server.tool(
    "list_buckets",
    "List Object Storage buckets in a compartment",
    {
      compartmentId: z.string().optional(),
      namespaceName: z.string().optional(),
    },
    async ({ compartmentId, namespaceName }) => {
      const cid = compartmentId || TENANCY;
      let ns = namespaceName;
      if (!ns) {
        const nsData = await ociGet(`${endpoint("objectstorage")}/n/`);
        ns = typeof nsData === "string" ? nsData : nsData.value;
      }
      const url = `${endpoint("objectstorage")}/n/${encodeURIComponent(ns)}/b?compartmentId=${encodeURIComponent(cid)}`;
      const data = await ociGet(url);
      const buckets = data.map((b) => ({
        name: b.name,
        namespace: b.namespace,
        compartmentId: b.compartmentId,
        timeCreated: b.timeCreated,
        storageClass: b.storageTier,
      }));
      return { content: [{ type: "text", text: JSON.stringify(buckets, null, 2) }] };
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

app.listen(3000, () => console.log("[oci] listening on :3000"));
