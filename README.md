# Cosi

Cosi is a self-extending MCP (Model Context Protocol) orchestrator. Describe a tool you need in plain language and Cosi writes the code, commits it to git, builds and deploys it as a container, and makes it immediately available — from Cosi's own chat UI or any MCP client like Claude Code or Cursor.

Tools built with Cosi are called **cositas**.

---

## What Cosi does

You talk to a single chat window. You can use existing tools or ask Cosi to build new ones. Both happen in the same conversation.

```
"Search our Jira board for open P1 bugs"
    → Cosi calls the jira cosita and returns results

"Build a tool that provisions EKS clusters using Terraform"
    → Cosi generates the MCP server code, commits to git,
      builder detects the commit, builds the container,
      orchestrator restarts, tool is live
```

Cosi's `/mcp` endpoint is a standards-compliant MCP server. Connect Claude Code, Cursor, or any MCP client and all your cositas appear immediately as callable tools.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        External MCP Clients                          │
│              Claude Code · Cursor · any MCP-compatible client        │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ HTTPS :8443
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           cosi-nginx                                 │
│                     TLS termination + reverse proxy                  │
│                                                                      │
│   /          → React SPA (Cloudscape dark mode)                      │
│   /api/*     → cosi-orchestrator :3001                               │
│   /mcp       → cosi-orchestrator :3001                               │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        cosi-orchestrator                             │
│                                                                      │
│  ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────┐  │
│  │   POST /api/chat │  │    POST /mcp      │  │  GET /api/tools  │  │
│  │   SSE stream     │  │  Streamable HTTP  │  │  GET /api/settings│ │
│  │  (build & use)   │  │  MCP server       │  │  POST /api/settings│ │
│  └────────┬─────────┘  └────────┬──────────┘  └──────────────────┘  │
│           │                     │                                    │
│  ┌────────▼─────────────────────▼──────────────────────────────────┐ │
│  │                         Core Services                           │ │
│  │                                                                 │ │
│  │  bedrock-client   ←──── AWS Bedrock (Claude Sonnet 4.6)         │ │
│  │  tool-generator   ←──── generates index.js, tool.json, etc.     │ │
│  │  registry         ←──── discovers tools/, health-checks         │ │
│  │  session-store    ←──── Redis (24h TTL, sliding window)         │ │
│  │  session-compact  ←──── auto-summarises long conversations      │ │
│  │  git-client       ←──── commits generated cositas to git        │ │
│  │  secrets          ←──── AWS Secrets Manager                     │ │
│  │  playbook         ←──── semantic memory (Titan embeddings)      │ │
│  └──────────┬──────────────────────────────────────────────────────┘ │
└─────────────┼────────────────────────────────────────────────────────┘
              │ MCP client calls (one per tool invocation)
              │ http://tool-<name>:3000/mcp
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Cosita Containers                              │
│                  (each tool runs as its own container)               │
│                                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │  tool-eks-manager    │  │  tool-terraform       │                 │
│  │  GET  /health        │  │  GET  /health         │  · · ·         │
│  │  POST /mcp           │  │  POST /mcp            │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│                                                                      │
│  ┌──────────────────────┐                                            │
│  │  tool-playbook       │  ← built-in semantic memory               │
│  │  add_playbook_entry  │    (Redis + Titan Text embeddings)         │
│  │  search_playbook     │    every cosita queries this automatically │
│  └──────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                           cosi-redis                                 │
│                                                                      │
│  cosi:session:chat:{id}    → conversation history (JSON)             │
│  playbook:entries          → set of entry UUIDs                      │
│  playbook:entry:{uuid}     → tool pattern + Titan embedding          │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    Git Repository  (source of truth)                 │
│                                                                      │
│  tools/                                                              │
│  ├── eks-manager/                                                    │
│  │   ├── index.js        MCP server + tool logic                     │
│  │   ├── tool.json       manifest: tools, secrets, port              │
│  │   ├── package.json                                                │
│  │   ├── Dockerfile                                                  │
│  │   └── system-prompt.md                                            │
│  ├── terraform/                                                      │
│  └── playbook/            ← built-in, ships with Cosi                │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                          cosi-builder                                │
│                     (privileged — Docker socket)                     │
│                                                                      │
│  1. Poll git every 5s                                                │
│  2. On new commit: diff tools/ to find changed cositas               │
│  3. docker build -t cosi-tool-<name>:latest tools/<name>            │
│  4. Regenerate docker-compose.tools.yml from tool.json files         │
│  5. docker compose up -d --remove-orphans                            │
│  6. Restart cosi-orchestrator so registry re-discovers the tool      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                           AWS Bedrock                                │
│              Claude Sonnet 4.6 (configurable per deployment)         │
│                                                                      │
│  · Chat responses and tool routing                                   │
│  · Cosita code generation (index.js, tool.json, Dockerfile)          │
│  · Session compaction — summarises long conversation history         │
│                                                                      │
│                         Amazon Titan Text                            │
│                  (amazon.titan-embed-text-v2:0, 1024 dim)            │
│                                                                      │
│  · Playbook semantic search — embed tool patterns, retrieve by query │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Tool creation flow

```
User types a request
        │
        ▼
  /api/chat (SSE)
        │
        ├── Normal tool call ──────────────────────────────────────────┐
        │   Bedrock routes to registered cosita                        │
        │   cosi-orchestrator → MCP client → tool container           │
        │   Result streamed back to UI                                 │
        │                                                              ▼
        │                                                        Response
        │
        └── Tool generation request ─────────────────────────────────┐
            Bedrock generates GENERATE_TOOL: marker + JSON spec       │
            tool-generator calls Bedrock again to write full code     │
            Files written to tools/<name>/                            │
            git commit + push                                         │
                    │                                                 │
                    ▼                                                 │
            cosi-builder detects commit (5s poll)                     │
            docker build → cosi-tool-<name>:latest                   │
            docker-compose.tools.yml regenerated                      │
            docker compose up -d                                      │
            orchestrator restarts → registry loads new tool           │
                    │                                                 │
                    └─────────────────────────────────────────────────┘
                                                                      ▼
                                                                Tool is live
```

---

## How data lives in git

The git repository is the single source of truth for all cositas. When Cosi creates a tool it commits the full source code directly to your repo.

```
tools/
├── eks-manager/
│   ├── index.js          Full MCP server implementation
│   ├── tool.json         Tool manifest (names, schemas, secrets)
│   ├── package.json      Node.js dependencies
│   ├── Dockerfile        Node 20 Alpine container
│   └── system-prompt.md  Human-readable description
└── playbook/             Built-in semantic memory tool
    └── ...
```

**Secrets are NOT stored in git.** Only the secret *names* appear in `tool.json`. The actual values live in AWS Secrets Manager and are injected at container start time.

**`docker-compose.tools.yml` is auto-generated** by the builder sidecar and is also not committed. It is regenerated each time the builder detects a change.

You own the tools. You can edit the source directly, commit changes, and the builder will detect and rebuild automatically.

---

## How sessions are stored

Conversation history is stored in Redis under the key `cosi:session:chat:{sessionId}`.

```json
{
  "messages": [
    { "role": "user",      "content": [{ "text": "..." }] },
    { "role": "assistant", "content": [{ "text": "..." }] }
  ],
  "compactedSummary": "Earlier: user built a GitHub issues tool...",
  "createdAt": "2025-03-29T07:00:00Z",
  "updatedAt": "2025-03-29T07:30:00Z"
}
```

Sessions have a 24-hour sliding TTL — each message resets the clock. When a session grows past the compaction threshold (default 20 messages), Cosi automatically summarises the older portion using Bedrock, keeps the last 8 messages verbatim, and stores the summary at the head of the context. This keeps long conversations manageable without losing decisions made earlier.

---

## Playbook — semantic memory

Every cosita automatically queries the playbook before executing. The playbook is a Redis-backed semantic memory store: you can record patterns, optimisations, and lessons learned about how to use your tools, and they are retrieved by similarity on every future invocation.

```
"Always use cursor-based pagination for large GitHub queries"
"Terraform apply requires plan output — never skip the plan step"
"EKS nodes take 4–6 minutes to become ready after cluster creation"
```

Entries are embedded with Amazon Titan Text (`amazon.titan-embed-text-v2:0`, 1024-dim), stored in Redis, and retrieved via cosine similarity search. The playbook also remembers patterns across all your tools — entries tagged `general` appear in every search regardless of which tool is querying.

---

## Example prompts

### AWS infrastructure

```
Build a tool that manages EKS clusters — create, describe, list,
scale node groups, and delete. Use the AWS SDK and read credentials
from the standard credential chain.
```

```
I need a tool for S3 — list buckets, upload files, download files,
generate presigned URLs, and manage bucket lifecycle policies.
Secret needed: none (use instance profile).
```

```
Build a CloudFormation tool that can deploy stacks from template files,
check stack status, tail stack events, and roll back failed deployments.
```

```
Create a tool for managing EC2 instances — start, stop, terminate,
describe, and get console output. Also needs to be able to create
AMIs from running instances.
```

```
I want a tool for AWS Secrets Manager — list secrets, get values,
create new secrets, and rotate them. Needs the AWS SDK with
STS assume-role support for cross-account access.
```

### Kubernetes

```
Build a tool for kubectl operations — get pods, describe deployments,
scale replicas, roll out a new image, and tail logs from any pod.
Read the kubeconfig from a mounted file at /etc/kubeconfig.
```

```
Create a Helm tool that can install and upgrade charts from any repo,
list releases, roll back to a previous revision, and run helm diff
before applying changes. Secret needed: helm-repo-credentials.
```

```
I need a tool to manage Kubernetes namespaces and RBAC — create
namespaces, apply resource quotas, create service accounts,
and bind cluster roles.
```

```
Build an Argo CD tool that can sync applications, check sync status,
list apps, get application health, and trigger rollbacks.
Secret needed: argocd/api-token.
```

```
Create a Prometheus/Grafana tool that can run PromQL queries,
list active alerts, silence alerts, and get dashboard links.
Secret needed: prometheus/url and grafana/api-key.
```

### Combined infrastructure workflows

```
Build a tool that can provision a full application environment:
create an EKS cluster, deploy cert-manager and nginx-ingress via Helm,
and output the load balancer URL. Chain these into a single
"provision_environment" operation.
```

```
I want a tool that handles blue/green deployments on Kubernetes:
deploy a new version as a separate deployment, smoke-test it with
a few requests, then shift traffic via a service patch and clean
up the old deployment.
```

```
Create a cost-management tool that calls AWS Cost Explorer to get
daily spend by service, flags anything that grew more than 20%
day-over-day, and posts a summary to a Slack webhook.
Secrets needed: aws/cost-explorer and slack/webhook-url.
```

---

## Prerequisites

**Docker Compose**
- Docker and Docker Compose v2
- `make` and `openssl`
- AWS credentials available in your environment (instance profile, `~/.aws/credentials`, or environment variables — no keys in `.env`)
- AWS Bedrock enabled in your region (default: Claude Sonnet 4.6, `us-west-2`)
- A git repository Cosi can commit generated tools to (can be this repo)

**Kubernetes (Helm)**
- Kubernetes 1.24+, Helm 3.10+
- A `ReadWriteMany`-capable StorageClass (EFS on EKS, NFS, or `local-path` for single-node)
- AWS credentials via IRSA, instance profile, or a Kubernetes secret

---

## Setup — Docker Compose

### 1. Clone and configure

```bash
git clone https://github.com/cbuckley-code/cosi.git
cd cosi
cp .env.example .env
```

Edit `.env`:

```bash
# Git repo Cosi commits generated cositas to — can be this repo
GIT_REPO_URL=https://github.com/your-org/cosi.git
GIT_BRANCH=main

# AWS region where Bedrock is enabled
AWS_REGION=us-west-2

# Bedrock model (Claude Sonnet 4.6 default — change if needed)
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6

# Prefix for secrets in AWS Secrets Manager
AWS_SECRET_PREFIX=cosi/
```

AWS credentials are **not** placed in `.env`. Cosi uses the standard AWS credential chain — if your shell can run `aws sts get-caller-identity`, the containers will have access.

### 2. Build and start

```bash
make build   # generates self-signed TLS cert, builds all containers
make up      # starts the stack
```

Cosi is now running at **https://localhost:8443** (accept the self-signed cert warning).

### 3. Useful commands

| Command | Description |
|---|---|
| `make logs` | Tail all logs |
| `make logs SERVICE=cosi-builder` | Tail one container |
| `make restart` | Restart all containers |
| `make rebuild-tool TOOL=<name>` | Force rebuild a specific cosita |
| `make tools` | Print all cosita manifests |
| `make clean` | Remove containers, images, and volumes |

---

## Setup — Kubernetes (Helm)

### 1. Add the Helm repo

```bash
helm repo add cosi https://cbuckley-code.github.io/Cosi
helm repo update
```

### 2. Install

Recommended — IRSA for AWS credentials:

```bash
helm install cosi cosi/cosi \
  --set orchestrator.git.repoUrl=https://github.com/your-org/cosi.git \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::123456789:role/cosi-role
```

Or with a Kubernetes credentials secret:

```bash
kubectl create secret generic cosi-aws \
  --from-literal=AWS_ACCESS_KEY_ID=<key-id> \
  --from-literal=AWS_SECRET_ACCESS_KEY=<secret>

helm install cosi cosi/cosi \
  --set orchestrator.git.repoUrl=https://github.com/your-org/cosi.git \
  --set aws.existingSecret=cosi-aws
```

### 3. Access the UI

```bash
# Port-forward (quickest)
kubectl port-forward svc/cosi-nginx 8443:443
# → https://localhost:8443

# Or expose via LoadBalancer
helm upgrade cosi cosi/cosi --set nginx.service.type=LoadBalancer
```

### 4. Ingress with cert-manager

```yaml
# values.yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  host: cosi.example.com
  tls:
    enabled: true
    secretName: cosi-tls
```

```bash
helm upgrade cosi cosi/cosi -f values.yaml
```

### Key values

| Value | Default | Description |
|---|---|---|
| `orchestrator.git.repoUrl` | `""` | **Required.** Git repo for cosita commits |
| `orchestrator.aws.region` | `us-west-2` | AWS region |
| `orchestrator.aws.bedrockModelId` | `us.anthropic.claude-sonnet-4-6` | Bedrock model ID |
| `aws.existingSecret` | `""` | K8s secret with `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |
| `serviceAccount.annotations` | `{}` | IRSA role annotation |
| `nginx.service.type` | `ClusterIP` | `LoadBalancer` to expose externally |
| `ingress.enabled` | `false` | Enable Ingress resource |
| `redis.persistence.size` | `2Gi` | Redis PVC size |
| `builder.toolsPvc.size` | `5Gi` | Shared tools PVC |

Full reference: [`helm/cosi/values.yaml`](helm/cosi/values.yaml)

---

## Connecting an external MCP client

Cosi's `/mcp` endpoint speaks standard streamable HTTP MCP. All cositas are exposed through it automatically.

### Claude Code

```json
{
  "mcpServers": {
    "cosi": {
      "url": "https://localhost:8443/mcp",
      "skipTlsVerification": true
    }
  }
}
```

### Cursor and others

Point any MCP client at `https://localhost:8443/mcp` (or your deployment URL) using the streamable HTTP transport. All cositas appear prefixed with their name:

```
eks-manager__create_cluster
eks-manager__scale_nodegroup
terraform__plan
terraform__apply
playbook__search_playbook
playbook__add_playbook_entry
```

---

## Secrets management

Secrets are stored in AWS Secrets Manager — never in git or the container image.

**Convention:** `<AWS_SECRET_PREFIX><tool-name>/<secret-name>`

```
Secret path:    cosi/eks-manager/aws/role-arn
Env variable:   COSI_SECRET_AWS_ROLE_ARN

Secret path:    cosi/argocd/argocd/api-token
Env variable:   COSI_SECRET_ARGOCD_API_TOKEN
```

Create a secret before deploying the cosita that needs it:

```bash
aws secretsmanager create-secret \
  --name cosi/github-issues/github/token \
  --secret-string "ghp_your_token_here"
```

Declare the secret name in `tool.json`:

```json
{
  "secrets": ["github/token"]
}
```

The builder sidecar reads `tool.json`, generates the environment variable placeholder in `docker-compose.tools.yml`, and Docker Compose injects the value at container start.

---

## Cosita structure

Every cosita is a self-contained Node.js MCP server:

```
tools/<name>/
├── index.js          Express server + MCP tool handlers
├── tool.json         Manifest: tool names, schemas, required secrets
├── package.json      ES module, Node 20
├── Dockerfile        Node 20 Alpine
└── system-prompt.md  Description of what the tool does
```

### tool.json

```json
{
  "name": "eks-manager",
  "description": "Manage EKS clusters and node groups",
  "version": "1.0.0",
  "tools": [
    {
      "name": "create_cluster",
      "description": "Create a new EKS cluster",
      "inputSchema": {
        "type": "object",
        "properties": {
          "name":        { "type": "string" },
          "region":      { "type": "string" },
          "nodeType":    { "type": "string" },
          "nodeCount":   { "type": "number" }
        },
        "required": ["name", "region"]
      }
    }
  ],
  "secrets": [],
  "port": 3000
}
```

### index.js (abbreviated)

```javascript
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json());

async function getPlaybookContext(toolName, query) {
  // automatically injected — queries tool-playbook:3000 for relevant patterns
  // returns [] gracefully if playbook is unavailable
}

function buildServer() {
  const server = new McpServer({ name: "eks-manager", version: "1.0.0" });

  server.tool("create_cluster", "Create a new EKS cluster",
    { name: z.string(), region: z.string(), nodeType: z.string().optional() },
    async ({ name, region, nodeType = "t3.medium" }) => {
      const playbook = await getPlaybookContext("eks-manager", `create_cluster ${name}`);
      // ... AWS SDK calls ...
      return { content: [{ type: "text", text: JSON.stringify({ cluster, playbook }) }] };
    }
  );

  return server;
}

app.get("/health", (_req, res) => res.json({ status: "ok", tool: "eks-manager" }));
app.get("/mcp",    (_req, res) => res.status(405).end());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000);
```

---

## Settings

The **Settings** panel in the UI lets you change:

- Git repo URL and branch
- AWS region
- Bedrock model ID
- AWS Secrets Manager prefix

Changes apply immediately — the orchestrator reinitialises its clients without a restart.

---

## Troubleshooting

**Containers won't start**
- `make logs` for errors
- `aws sts get-caller-identity` to verify credentials
- Confirm the Bedrock model is enabled in your region

**Cosita not appearing after creation**
- `make logs SERVICE=cosi-builder` — check for build errors
- `make rebuild-tool TOOL=<name>` to force a rebuild
- Verify the Docker socket is accessible: `docker exec cosi-builder docker ps`

**External MCP client can't connect**
- `curl -k https://localhost:8443/health` — confirm Cosi is up
- Enable TLS bypass in your client for the self-signed cert
- Confirm your client supports streamable HTTP MCP transport

**Helm: pods stuck in Pending**
- `kubectl get pvc` — the tools PVC requires a `ReadWriteMany` StorageClass (EFS on EKS, NFS, or `local-path` for single-node)

**Helm: chart not found**
- `helm repo update cosi` and retry
- Confirm GitHub Pages is enabled on the `gh-pages` branch (Settings → Pages)

**Session appears empty after long conversation**
- This is normal — Cosi compacted the session. The full context is preserved as a summary at the head of the conversation.

---

## Version

Current version: **1.0.0** — see [`VERSION`](VERSION).

Docker images are published to `ghcr.io/cbuckley-code/` on every `v*.*.*` tag.

```bash
ghcr.io/cbuckley-code/cosi-orchestrator:1.0.0
ghcr.io/cbuckley-code/cosi-ui:1.0.0
ghcr.io/cbuckley-code/cosi-builder:1.0.0
```
