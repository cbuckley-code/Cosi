# Azure Cosita

Manages Azure cloud infrastructure via the Azure SDK for JavaScript.

## Capabilities

- **Resource Groups**: List all resource groups in the subscription
- **Virtual Machines**: List, get instance view, start/stop/deallocate/restart
- **AKS**: List clusters, describe cluster with node pool details

## Credentials

Uses a Service Principal (client credentials flow):
- `COSI_SECRET_AZURE_SUBSCRIPTION_ID`
- `COSI_SECRET_AZURE_TENANT_ID`
- `COSI_SECRET_AZURE_CLIENT_ID`
- `COSI_SECRET_AZURE_CLIENT_SECRET`

## Setup

1. Create a Service Principal: `az ad sp create-for-rbac --name cosi --role Contributor --scopes /subscriptions/<id>`
2. Enable this cosita and add your secrets via Cosi Settings → Secrets:
   - `azure/subscription-id`
   - `azure/tenant-id`
   - `azure/client-id`
   - `azure/client-secret`
