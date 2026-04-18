# OCI Cosita

Manages Oracle Cloud Infrastructure via the OCI REST APIs with RSA-SHA256 request signing.

## Capabilities

- **Compartments**: List all compartments in the tenancy
- **Compute**: List instances, start/stop/reset/soft-stop
- **OKE**: List Kubernetes Engine clusters
- **Object Storage**: List buckets in a compartment

## Credentials

OCI uses API key authentication with RSA signing:
- `COSI_SECRET_OCI_TENANCY_OCID` — tenancy OCID (ocid1.tenancy.oc1...)
- `COSI_SECRET_OCI_USER_OCID` — user OCID (ocid1.user.oc1...)
- `COSI_SECRET_OCI_FINGERPRINT` — API key fingerprint (xx:xx:xx:...)
- `COSI_SECRET_OCI_PRIVATE_KEY` — PEM private key contents (use `\n` for newlines)
- `COSI_SECRET_OCI_REGION` — OCI region identifier (e.g. us-ashburn-1)

## Setup

1. In OCI Console → Identity → Users → your user → API Keys → Add API Key
2. Download the private key and note the fingerprint
3. Enable this cosita and add secrets via Cosi Settings → Secrets:
   - `oci/tenancy-ocid`, `oci/user-ocid`, `oci/fingerprint`, `oci/private-key`, `oci/region`
