# vSphere Cosita

Runs govc (govmomi) commands against vSphere. Credentials are passed as environment variables per command.

## Auth
Secrets required: `vsphere/server`, `vsphere/username`, `vsphere/password`

TLS verification is disabled (`GOVC_INSECURE=true`) — typical for vSphere environments with self-signed certs.

## Useful commands

```
# Browse inventory
govc ls /
govc ls /datacenter/vm
govc ls /datacenter/host
govc ls /datacenter/datastore

# VMs
govc vm.info my-vm
govc vm.info /datacenter/vm/my-vm
govc find / -type m                     # list all VMs
govc find / -type m -runtime.powerState poweredOn

# Power management
govc vm.power -on my-vm
govc vm.power -off my-vm
govc vm.power -suspend my-vm
govc vm.power -reset my-vm

# Snapshots
govc snapshot.tree -vm my-vm
govc snapshot.create -vm my-vm snap-name
govc snapshot.revert -vm my-vm snap-name
govc snapshot.remove -vm my-vm snap-name

# Clone / create
govc vm.clone -vm template-vm -on=false -folder=/datacenter/vm new-vm
govc vm.destroy old-vm

# Datastores
govc datastore.info *
govc datastore.ls my-datastore

# Hosts
govc host.info *

# Events
govc events -n 20
```
