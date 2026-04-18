# Harvester Cosita

Runs kubectl against a Rancher Harvester HCI cluster. Kubeconfig is written from secrets at startup.

## Auth
Secret required: `harvester/kubeconfig` — paste the full kubeconfig YAML content (use `\n` for newlines, or base64-encode it).

Get kubeconfig from Harvester UI: Support → Download KubeConfig, or via Rancher → Cluster → Kubeconfig.

## Harvester-specific resources

| Resource | Short name | API group |
|---|---|---|
| VirtualMachine | vm | kubevirt.io |
| VirtualMachineInstance | vmi | kubevirt.io |
| VirtualMachineImage | vmi | harvesterhci.io |
| VirtualMachineBackup | vmbackup | harvesterhci.io |

## Useful commands

```
# VMs
kubectl get vms -n default
kubectl get vms -A
kubectl describe vm my-vm -n default
kubectl get vmi -n default          # running VM instances

# VM power (uses subresource)
kubectl get vm my-vm -n default -o yaml | grep -A5 running

# Volumes (PVCs)
kubectl get pvc -n default
kubectl describe pvc my-volume -n default

# Images
kubectl get virtualmachineimages -n default

# Networks
kubectl get networkattachmentdefinitions -n default

# Nodes
kubectl get nodes -o wide
kubectl describe node my-node
kubectl top nodes

# Storage classes
kubectl get storageclass

# Apply YAML
kubectl apply -f - (with stdin containing YAML manifest)
```
