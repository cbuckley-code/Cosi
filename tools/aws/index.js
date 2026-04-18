import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  EC2Client,
  DescribeInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { EKSClient, ListClustersCommand, DescribeClusterCommand } from "@aws-sdk/client-eks";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from "@aws-sdk/client-cloudwatch";

const ACCESS_KEY = process.env.COSI_SECRET_AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.COSI_SECRET_AWS_SECRET_ACCESS_KEY;
const DEFAULT_REGION = process.env.COSI_SECRET_AWS_REGION || "us-east-1";

function cfg(region) {
  const c = { region: region || DEFAULT_REGION };
  if (ACCESS_KEY && SECRET_KEY) c.credentials = { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY };
  return c;
}

function buildServer() {
  const server = new McpServer({ name: "aws", version: "1.0.0" });

  server.tool(
    "list_ec2_instances",
    "List EC2 instances in a region, optionally filtered by state",
    { region: z.string().optional(), state: z.string().optional() },
    async ({ region, state }) => {
      const client = new EC2Client(cfg(region));
      const filters = state ? [{ Name: "instance-state-name", Values: [state] }] : [];
      const resp = await client.send(new DescribeInstancesCommand({ Filters: filters }));
      const instances = resp.Reservations.flatMap((r) =>
        r.Instances.map((i) => ({
          id: i.InstanceId,
          type: i.InstanceType,
          state: i.State.Name,
          az: i.Placement?.AvailabilityZone,
          privateIp: i.PrivateIpAddress,
          publicIp: i.PublicIpAddress,
          name: i.Tags?.find((t) => t.Key === "Name")?.Value,
          launchTime: i.LaunchTime,
        }))
      );
      return { content: [{ type: "text", text: JSON.stringify(instances, null, 2) }] };
    }
  );

  server.tool(
    "manage_ec2_instance",
    "Start, stop, reboot, or terminate an EC2 instance",
    {
      instanceId: z.string(),
      action: z.enum(["start", "stop", "reboot", "terminate"]),
      region: z.string().optional(),
    },
    async ({ instanceId, action, region }) => {
      const client = new EC2Client(cfg(region));
      const ids = { InstanceIds: [instanceId] };
      let result;
      if (action === "start") result = await client.send(new StartInstancesCommand(ids));
      else if (action === "stop") result = await client.send(new StopInstancesCommand(ids));
      else if (action === "reboot") result = await client.send(new RebootInstancesCommand(ids));
      else result = await client.send(new TerminateInstancesCommand(ids));
      return { content: [{ type: "text", text: JSON.stringify({ instanceId, action, result: "success" }) }] };
    }
  );

  server.tool(
    "list_s3_buckets",
    "List all S3 buckets in the account",
    {},
    async () => {
      const client = new S3Client(cfg());
      const resp = await client.send(new ListBucketsCommand({}));
      const buckets = resp.Buckets.map((b) => ({ name: b.Name, created: b.CreationDate }));
      return { content: [{ type: "text", text: JSON.stringify(buckets, null, 2) }] };
    }
  );

  server.tool(
    "s3_operations",
    "List objects, get, put, or delete an object in S3",
    {
      bucket: z.string(),
      action: z.enum(["list", "get", "put", "delete"]),
      key: z.string().optional(),
      content: z.string().optional(),
      prefix: z.string().optional(),
    },
    async ({ bucket, action, key, content, prefix }) => {
      const client = new S3Client(cfg());
      if (action === "list") {
        const resp = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
        const objects = (resp.Contents || []).map((o) => ({ key: o.Key, size: o.Size, modified: o.LastModified }));
        return { content: [{ type: "text", text: JSON.stringify(objects, null, 2) }] };
      }
      if (action === "get") {
        const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = await resp.Body.transformToString();
        return { content: [{ type: "text", text: body }] };
      }
      if (action === "put") {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: content }));
        return { content: [{ type: "text", text: JSON.stringify({ bucket, key, action: "put", result: "success" }) }] };
      }
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return { content: [{ type: "text", text: JSON.stringify({ bucket, key, action: "delete", result: "success" }) }] };
    }
  );

  server.tool(
    "list_eks_clusters",
    "List EKS clusters in a region",
    { region: z.string().optional() },
    async ({ region }) => {
      const client = new EKSClient(cfg(region));
      const resp = await client.send(new ListClustersCommand({}));
      return { content: [{ type: "text", text: JSON.stringify(resp.clusters, null, 2) }] };
    }
  );

  server.tool(
    "describe_eks_cluster",
    "Get detailed information about an EKS cluster",
    { clusterName: z.string(), region: z.string().optional() },
    async ({ clusterName, region }) => {
      const client = new EKSClient(cfg(region));
      const resp = await client.send(new DescribeClusterCommand({ name: clusterName }));
      const c = resp.cluster;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: c.name,
            version: c.version,
            status: c.status,
            endpoint: c.endpoint,
            roleArn: c.roleArn,
            createdAt: c.createdAt,
            tags: c.tags,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "list_rds_instances",
    "List RDS database instances in a region",
    { region: z.string().optional() },
    async ({ region }) => {
      const client = new RDSClient(cfg(region));
      const resp = await client.send(new DescribeDBInstancesCommand({}));
      const instances = resp.DBInstances.map((db) => ({
        id: db.DBInstanceIdentifier,
        engine: db.Engine,
        engineVersion: db.EngineVersion,
        class: db.DBInstanceClass,
        status: db.DBInstanceStatus,
        endpoint: db.Endpoint?.Address,
        multiAz: db.MultiAZ,
        storage: db.AllocatedStorage,
      }));
      return { content: [{ type: "text", text: JSON.stringify(instances, null, 2) }] };
    }
  );

  server.tool(
    "get_cloudwatch_metrics",
    "Get CloudWatch metric statistics over a time window",
    {
      namespace: z.string(),
      metricName: z.string(),
      dimensionName: z.string(),
      dimensionValue: z.string(),
      minutes: z.number().optional(),
      region: z.string().optional(),
    },
    async ({ namespace, metricName, dimensionName, dimensionValue, minutes = 60, region }) => {
      const client = new CloudWatchClient(cfg(region));
      const endTime = new Date();
      const startTime = new Date(endTime - minutes * 60 * 1000);
      const resp = await client.send(new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: [{ Name: dimensionName, Value: dimensionValue }],
        StartTime: startTime,
        EndTime: endTime,
        Period: Math.max(60, Math.floor((minutes * 60) / 100)),
        Statistics: ["Average", "Maximum", "Minimum"],
      }));
      const points = resp.Datapoints.sort((a, b) => a.Timestamp - b.Timestamp);
      return { content: [{ type: "text", text: JSON.stringify(points, null, 2) }] };
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
