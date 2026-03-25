# Cosi — MCP Orchestrator Platform

Cosi is a self-extending MCP (Model Context Protocol) orchestrator. You describe a tool in plain language, and Cosi generates a full MCP server implementation, commits it to git, builds and deploys it as a container, and immediately makes it available — from Cosi's own chat UI or any external MCP client like Claude Code or Cursor.

Tools built with Cosi are called **cositas**.

---

## How it works

```
You describe a tool  →  Cosi generates the code  →  commits to git
      →  builder sidecar detects the commit  →  builds the container
      →  orchestrator restarts  →  tool is live
```

Cosi's `/mcp` endpoint is a standards-compliant MCP server. Any MCP client can connect to it and use all your cositas immediately.

---

## Architecture

```
  ┌─────────────────────────────────────────────────────────────────┐
  │               External MCP Clients                              │
  │        Claude Code · Cursor · any MCP-compatible client         │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ HTTPS :8443
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                        cosi-nginx                               │
  │                  TLS termination + reverse proxy                │
  │                                                                 │
  │   /          → React UI (Cloudscape dark mode, static assets)   │
  │   /api/*     → cosi-orchestrator :3001                          │
  │   /mcp       → cosi-orchestrator :3001                          │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ HTTP (internal)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                     cosi-orchestrator                           │
  │                                                                 │
  │  ┌─────────────────┐   ┌──────────────┐   ┌─────────────────┐  │
  │  │   MCP Server    │   │ Builder API  │   │   User Chat     │  │
  │  │ (streamable HTTP│   │ POST /api/   │   │ POST /api/user/ │  │
  │  │  tools/list     │   │ builder/chat │   │ chat (SSE)      │  │
  │  │  tools/call)    │   │ (SSE stream) │   └────────┬────────┘  │
  │  └────────┬────────┘   └──────┬───────┘            │           │
  │           │                   │                     │           │
  │  ┌────────▼───────────────────▼─────────────────────▼────────┐ │
  │  │                      Core Services                         │ │
  │  │  registry.js      tool-generator.js    bedrock-client.js   │ │
  │  │  git-client.js    secrets.js           session-store.js    │ │
  │  │                   session-compaction.js                    │ │
  │  └──────────────┬──────────────────────────────┬─────────────┘ │
  └─────────────────┼──────────────────────────────┼───────────────┘
                    │ MCP client calls              │ ioredis
                    │ (route tools/call)            ▼
  ┌─────────────────┼──────────────┐  ┌────────────────────────────┐
  │  Cosita containers             │  │        cosi-redis           │
  │                │               │  │                             │
  │  ┌─────────────▼─────────────┐ │  │  Session history (TTL 24h) │
  │  │  tool-github-issues :3000 │ │  │  Auto-compaction via        │
  │  │  GET  /health             │ │  │  Bedrock summarization      │
  │  │  POST /mcp                │ │  └────────────────────────────┘
  │  └───────────────────────────┘ │
  │  ┌───────────────────────────┐ │
  │  │  tool-jira        :3000   │ │
  │  └───────────────────────────┘ │
  │  ┌───────────────────────────┐ │
  │  │  tool-<your-cosita> :3000 │ │
  │  └───────────────────────────┘ │
  └────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────┐
  │                       cosi-builder                              │
  │                  (privileged — Docker socket)                   │
  │                                                                 │
  │   1. Poll git every 5s — track commit hash                      │
  │   2. Diff changed tools/ directories                            │
  │   3. docker build → cosi-tool-<name>:latest                    │
  │   4. Regenerate docker-compose.tools.yml                        │
  │   5. docker compose up -d --remove-orphans                      │
  │   6. Restart cosi-orchestrator                                  │
  └──────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                      Git Repository                             │
  │              (source of truth for all cositas)                  │
  │                                                                 │
  │   tools/                                                        │
  │   ├── github-issues/                                            │
  │   │   ├── index.js   tool.json   package.json   Dockerfile      │
  │   ├── jira/                                                      │
  │   └── <your-cosita>/                                            │
  └─────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────┐
  │                       AWS Bedrock                               │
  │        Claude Sonnet (or any configured Bedrock model)          │
  │                                                                 │
  │   · Builder chat — design conversations                         │
  │   · Tool generation — writes index.js, tool.json, Dockerfile    │
  │   · User chat — natural language → tool calls                   │
  │   · Session compaction — summarizes long conversation history   │
  └─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

**Docker Compose (local)**
- Docker and Docker Compose v2
- `make`
- `openssl` (for self-signed TLS cert generation)
- AWS credentials available in your environment (instance profile, `~/.aws/credentials`, or environment variables — no keys in `.env`)
- An AWS Bedrock model enabled in your region (default: Claude Sonnet 4)
- A git repository Cosi can commit generated tools to (can be this repo itself)

**Kubernetes (Helm)**
- Kubernetes 1.24+
- Helm 3.10+
- A `ReadWriteMany`-capable StorageClass (for the shared tools PVC)
- AWS credentials via IRSA, instance profile, or a Kubernetes secret

---

## Deploy on Kubernetes with Helm

The Cosi Helm chart is hosted on GitHub Pages and published automatically whenever `helm/` changes on `main`.

### 1. Add the Helm repository

```bash
helm repo add cosi https://cbuckley-code.github.io/Cosi
helm repo update
```

### 2. Install

```bash
helm install cosi cosi/cosi \
  --set orchestrator.git.repoUrl=https://github.com/your-org/cosi-tools.git \
  --set aws.existingSecret=cosi-aws
```

> **AWS credentials** — recommended approach is IRSA. Annotate the service account:
> ```bash
> helm install cosi cosi/cosi \
>   --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::123456789:role/cosi-role \
>   --set orchestrator.git.repoUrl=https://github.com/your-org/cosi-tools.git
> ```
>
> Or create a credentials secret and reference it:
> ```bash
> kubectl create secret generic cosi-aws \
>   --from-literal=AWS_ACCESS_KEY_ID=<key-id> \
>   --from-literal=AWS_SECRET_ACCESS_KEY=<secret>
> helm install cosi cosi/cosi --set aws.existingSecret=cosi-aws \
>   --set orchestrator.git.repoUrl=https://github.com/your-org/cosi-tools.git
> ```

### 3. Access the UI

By default the nginx Service is `ClusterIP`. Port-forward to get started:

```bash
kubectl port-forward svc/cosi-nginx 8443:443
```

Then open **https://localhost:8443** (accept the self-signed cert warning).

To expose via a LoadBalancer:

```bash
helm upgrade cosi cosi/cosi --set nginx.service.type=LoadBalancer
```

Or enable Ingress (e.g. with cert-manager):

```yaml
# my-values.yaml
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
helm upgrade cosi cosi/cosi -f my-values.yaml
```

### 4. Connect an MCP client

```json
{
  "mcpServers": {
    "cosi": {
      "url": "https://cosi.example.com/mcp",
      "skipTlsVerification": true
    }
  }
}
```

### Key values

| Value | Default | Description |
|---|---|---|
| `orchestrator.git.repoUrl` | `""` | **Required.** Git repo Cosi commits cositas to |
| `orchestrator.aws.region` | `us-west-2` | AWS region for Bedrock and Secrets Manager |
| `orchestrator.aws.bedrockModelId` | Claude Sonnet 4 | Bedrock model ID |
| `aws.existingSecret` | `""` | K8s secret with `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |
| `git.existingSecret` | `""` | K8s secret with `GIT_TOKEN` for git push auth |
| `nginx.tls.existingSecret` | `""` | Existing TLS secret; omit to auto-generate self-signed cert |
| `redis.persistence.size` | `2Gi` | Redis PVC size |
| `builder.toolsPvc.size` | `5Gi` | Shared tools PVC size |
| `ingress.enabled` | `false` | Enable Ingress resource |
| `serviceAccount.annotations` | `{}` | Use for IRSA role annotation |

Full reference: [`helm/cosi/values.yaml`](helm/cosi/values.yaml)

### Upgrading

```bash
helm repo update
helm upgrade cosi cosi/cosi
```

### Uninstalling

```bash
helm uninstall cosi
# PVCs are not deleted automatically — remove manually if desired:
kubectl delete pvc cosi-tools cosi-redis
```

---

## Setup (Docker Compose)

### 1. Clone the repo

```bash
git clone https://github.com/your-org/cosi.git
cd cosi
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# The git repo Cosi commits generated cositas to
# Can be this repo's own URL
GIT_REPO_URL=https://github.com/your-org/cosi.git
GIT_BRANCH=main

# AWS region where your Bedrock model is enabled
AWS_REGION=us-west-2

# Bedrock model ID to use (default works if Claude Sonnet 4 is enabled)
BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-20250514-v1:0

# Prefix for secrets in AWS Secrets Manager (see Secrets section below)
AWS_SECRET_PREFIX=cosi/

# GovCloud — set to true if using AWS GovCloud regions
AWS_GOVCLOUD=false
```

You do **not** put AWS access keys in `.env`. Cosi uses the standard AWS credential chain — if your shell has access to AWS, the containers will too via environment variable passthrough or instance profile.

### 3. Generate TLS certificate and build

```bash
make build
```

This generates a self-signed certificate (`cosi-ui/certs/`) and builds all containers.

### 4. Start the stack

```bash
make up
```

Cosi is now running at **https://localhost:8443**.

> The self-signed certificate will trigger a browser warning — click through it. To use a real certificate, replace `cosi-ui/certs/cosi.crt` and `cosi-ui/certs/cosi.key` before building.

---

## Using the UI

Navigate to **https://localhost:8443**.

### Builder — create cositas

Open the **Builder** view. Describe the tool you want in plain language. Cosi will:

1. Ask clarifying questions about operations, APIs, and credentials needed
2. Present a design summary for your approval
3. Generate and deploy the tool once you confirm

Example conversation:

> **You:** I want a tool that searches GitHub issues and creates new ones using a personal access token.
>
> **Cosi:** I can build that. A few questions: do you need to search across all repos or a specific one? Should create support labels and assignees?
>
> **You:** One specific repo, and yes — labels and assignees would be great.
>
> **Cosi:** Here's the design: tool name `github-issues`, two functions: `search_issues(repo, query, state)` and `create_issue(repo, title, body, labels, assignees)`. Requires one secret: `github/token`. Ready to build?
>
> **You:** Yes, build it.
>
> **Cosi:** *(generates code, commits to git, builder sidecar picks it up and deploys)*

### Chat — use your cositas

Open the **Chat** view. Ask questions or give commands. Cosi routes to the right tool automatically.

> **You:** Search for open bugs in cbuckley-code/cosi
>
> **Cosi:** *(calls `github-issues__search_issues`, returns results)*

### Settings

Configure git repo URL, AWS region, Bedrock model, and Secrets Manager prefix. Changes take effect immediately — no restart needed.

---

## Connecting an external MCP client

Cosi's `/mcp` endpoint speaks standard streamable HTTP MCP. Any client that supports it can connect.

### Claude Code

Add to your Claude Code MCP config (`~/.claude/config.json` or via `/mcp`):

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

### Cursor / other clients

Point the client at `https://localhost:8443/mcp` using streamable HTTP transport. Enable TLS verification bypass for the self-signed cert, or install the cert as trusted.

Once connected, all your cositas appear as tools prefixed with their name:

```
github-issues__search_issues
github-issues__create_issue
jira__search_issues
jira__create_issue
```

---

## Building cositas (tools)

A cosita is a Node.js MCP server running in its own container. Cosi generates them automatically, but here's what's inside.

### Structure

Every cosita lives in `tools/<tool-name>/`:

```
tools/
└── github-issues/
    ├── index.js          # MCP server — your tool logic lives here
    ├── tool.json         # manifest: tool definitions, secrets, port
    ├── package.json
    ├── Dockerfile
    └── system-prompt.md  # describes what the tool does
```

### `tool.json`

The manifest tells Cosi what tools the cosita exposes and what secrets it needs:

```json
{
  "name": "github-issues",
  "description": "Search and create GitHub issues",
  "version": "1.0.0",
  "tools": [
    {
      "name": "search_issues",
      "description": "Search issues in a GitHub repo",
      "inputSchema": {
        "type": "object",
        "properties": {
          "repo": { "type": "string", "description": "owner/repo" },
          "query": { "type": "string", "description": "Search query" },
          "state": { "type": "string", "description": "open, closed, or all" }
        },
        "required": ["repo", "query"]
      }
    }
  ],
  "secrets": ["github/token"],
  "port": 3000
}
```

### `index.js`

A cosita is a standard Express + MCP server:

```javascript
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json());

const server = new McpServer({ name: "github-issues", version: "1.0.0" });

server.tool(
  "search_issues",
  "Search issues in a GitHub repo",
  { repo: z.string(), query: z.string(), state: z.string().optional() },
  async ({ repo, query, state = "open" }) => {
    const token = process.env.GITHUB_TOKEN;
    // ... call GitHub API ...
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

app.get("/health", (req, res) => res.json({ status: "ok", tool: "github-issues" }));

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.writeHead(200, { "Content-Type": "application/json", "Transfer-Encoding": "chunked" });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000, () => console.log("github-issues listening on port 3000"));
```

### Secrets

Secrets are stored in AWS Secrets Manager and injected as environment variables when the cosita container starts.

**Naming convention:** `<AWS_SECRET_PREFIX><tool-name>/<secret-name>`

Example — if `AWS_SECRET_PREFIX=cosi/` and your tool needs `github/token`:

```
Secret path: cosi/github-issues/github/token
Env variable injected: GITHUB_TOKEN (uppercased, slashes → underscores)
```

Create the secret in AWS before deploying:

```bash
aws secretsmanager create-secret \
  --name cosi/github-issues/github/token \
  --secret-string "ghp_your_token_here"
```

### Building manually

If you want to build a cosita outside the Builder chat:

1. Create `tools/<tool-name>/` with `index.js`, `tool.json`, `package.json`, `Dockerfile`
2. Commit and push — the builder sidecar will detect and deploy it automatically

Or trigger a rebuild directly:

```bash
make rebuild-tool TOOL=github-issues
```

---

## Architecture overview

| Container | Role |
|---|---|
| `cosi-nginx` | TLS termination, reverse proxy, serves the React UI |
| `cosi-orchestrator` | MCP server + client, builder API, Bedrock integration, git client |
| `cosi-builder` | Watches git, builds cosita images, updates docker-compose |
| `cosi-redis` | Session store — persists builder and chat conversation history |
| `tool-<name>` | Each cosita runs as its own container on port 3000 |

The git repo is the source of truth. The builder sidecar polls git every 5 seconds, detects new or changed cositas, builds their images, and restarts the orchestrator.

---

## Makefile reference

| Command | Description |
|---|---|
| `make build` | Generate certs and build all containers |
| `make up` | Start the full stack |
| `make down` | Stop all containers |
| `make restart` | Restart all containers |
| `make logs` | Tail all logs (`SERVICE=cosi-orchestrator make logs` for one container) |
| `make clean` | Stop containers and remove all images and volumes |
| `make rebuild-tool TOOL=<name>` | Rebuild and restart a specific cosita |
| `make tools` | Print all registered cosita manifests |
| `make certs` | Regenerate the self-signed TLS certificate |

---

## Session management

Conversation history (both Builder and Chat) is stored in Redis with a 24-hour sliding TTL. When a session grows long, Cosi automatically **compacts** it — older messages are summarized by Bedrock and replaced with a prose summary, while the most recent exchanges are kept verbatim. This keeps context windows manageable without losing important decisions from earlier in the conversation.

---

## Troubleshooting

**Containers won't start**
- Check `make logs` for errors
- Verify AWS credentials are available: `aws sts get-caller-identity`
- Confirm the Bedrock model is enabled in your region

**Builder chat returns errors**
- Check the Bedrock model ID in Settings matches one enabled in your region
- Verify `GIT_REPO_URL` is set and the orchestrator container has git push access

**Cosita not appearing after creation**
- Check builder logs: `SERVICE=cosi-builder make logs`
- Verify the Docker socket is mounted: `docker exec cosi-builder docker ps`
- Run `make rebuild-tool TOOL=<name>` to force a rebuild

**External MCP client can't connect**
- Confirm Cosi is running: `curl -k https://localhost:8443/health`
- Enable TLS verification bypass in your client for the self-signed cert
- Check your client supports streamable HTTP MCP transport

**Helm: pods stuck in Pending**
- Check PVC status: `kubectl get pvc` — the tools PVC requires a `ReadWriteMany` StorageClass (e.g. EFS on EKS, NFS, or `local-path` for single-node clusters)
- Describe the pod for scheduling events: `kubectl describe pod <pod-name>`

**Helm: builder can't reach Docker**
- The builder mounts the node's Docker socket (`/var/run/docker.sock`). Verify Docker is running on the node and the path matches `builder.dockerSocket.hostPath` in your values

**Helm: chart not found after `helm repo add`**
- Confirm GitHub Pages is enabled on the `gh-pages` branch for the Cosi repository (Settings → Pages)
- Run `helm repo update cosi` and try again
