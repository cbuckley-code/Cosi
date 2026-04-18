# Harvester Cosita

Manages Rancher Harvester HCI (Hyperconverged Infrastructure) via its Kubernetes-based API.

## Capabilities

- **VMs**: List virtual machines with CPU/memory/node info, start/stop/restart
- **Volumes**: List PersistentVolumeClaims with storage class and size
- **Images**: List VM images with download status and size
- **Networks**: List NetworkAttachmentDefinitions (VLAN networks)
- **Nodes**: List cluster nodes with CPU/memory capacity and roles

## Credentials

- `COSI_SECRET_HARVESTER_SERVER` — Harvester server FQDN or IP (e.g. harvester.example.com)
- `COSI_SECRET_HARVESTER_TOKEN` — Bearer token from Harvester (generate in Rancher → Account & API Keys)

TLS certificate verification is disabled by default.

## Setup

1. In Harvester/Rancher UI, generate an API token (Account & API Keys → Create API Key)
2. Enable this cosita and add secrets via Cosi Settings → Secrets:
   - `harvester/server` → Harvester server address
   - `harvester/token` → API bearer token
3. The token user needs at minimum read access to the VMs, volumes, and nodes
