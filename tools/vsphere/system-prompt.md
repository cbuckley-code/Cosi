# vSphere Cosita

Manages VMware vSphere infrastructure via the vSphere REST API (vCenter 7.0+).

## Capabilities

- **VMs**: List with power state filter, get detailed VM info, power on/off/suspend/reset
- **Hosts**: List ESXi hosts with connection and power state
- **Datastores**: List with capacity and free space in GB
- **Resource Pools**: List resource pools in the inventory

## Credentials

- `COSI_SECRET_VSPHERE_SERVER` — vCenter FQDN or IP (e.g. vcenter.example.com)
- `COSI_SECRET_VSPHERE_USERNAME` — vCenter username (e.g. administrator@vsphere.local)
- `COSI_SECRET_VSPHERE_PASSWORD` — vCenter password

TLS certificate verification is disabled by default (self-signed certs are common in vSphere environments).

## Setup

1. Ensure the vCenter REST API is accessible from the Cosi host on port 443
2. Enable this cosita and add secrets via Cosi Settings → Secrets:
   - `vsphere/server`, `vsphere/username`, `vsphere/password`
3. The user account needs at minimum read privileges on the vSphere inventory
