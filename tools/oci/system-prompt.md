# OCI Cosita

Runs Oracle Cloud Infrastructure CLI commands. Writes `~/.oci/config` from secrets at startup.

## Auth
Secrets required: `oci/tenancy-ocid`, `oci/user-ocid`, `oci/fingerprint`, `oci/private-key`, `oci/region`

Generate API key: OCI Console → Identity → Users → your user → API Keys → Add API Key

For `oci/private-key`: paste the full PEM contents, using `\n` for newlines.

## Useful commands

```
# Compartments
oci iam compartment list --compartment-id <tenancy-ocid> --compartment-id-in-subtree true

# Compute
oci compute instance list --compartment-id <compartment-ocid> --output table
oci compute instance get --instance-id <instance-ocid>
oci compute instance action --instance-id <instance-ocid> --action START
oci compute instance action --instance-id <instance-ocid> --action STOP
oci compute instance action --instance-id <instance-ocid> --action RESET

# OKE (Kubernetes)
oci ce cluster list --compartment-id <compartment-ocid>
oci ce cluster get --cluster-id <cluster-ocid>
oci ce cluster create-kubeconfig --cluster-id <cluster-ocid> --file /tmp/kubeconfig

# Object Storage
oci os bucket list --compartment-id <compartment-ocid>
oci os object list --bucket-name my-bucket
oci os object get --bucket-name my-bucket --name myfile.txt --file /tmp/myfile.txt

# Networking
oci network vcn list --compartment-id <compartment-ocid>
oci network subnet list --compartment-id <compartment-ocid>

# Load Balancer
oci lb load-balancer list --compartment-id <compartment-ocid>
```
