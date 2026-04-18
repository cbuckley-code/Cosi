# Azure Cosita

Runs Azure CLI (az) commands. Authenticates as a Service Principal at startup.

## Auth
Secrets required: `azure/subscription-id`, `azure/tenant-id`, `azure/client-id`, `azure/client-secret`

Create a service principal: `az ad sp create-for-rbac --name cosi --role Contributor --scopes /subscriptions/<id>`

## Useful commands

```
# Resource Groups
az group list --output table
az group create --name myRG --location eastus

# Virtual Machines
az vm list --output table
az vm list --resource-group myRG --show-details --output table
az vm start --resource-group myRG --name myVM
az vm stop --resource-group myRG --name myVM
az vm deallocate --resource-group myRG --name myVM
az vm show --resource-group myRG --name myVM --show-details

# AKS
az aks list --output table
az aks list --resource-group myRG --output table
az aks show --resource-group myRG --name myCluster
az aks get-credentials --resource-group myRG --name myCluster
az aks scale --resource-group myRG --name myCluster --node-count 5

# Storage
az storage account list --output table
az storage container list --account-name myaccount --output table

# App Service
az webapp list --output table
az webapp restart --resource-group myRG --name myApp

# Cost
az consumption usage list --top 10 --output table
```
