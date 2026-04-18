# GCP Cosita

Manages Google Cloud Platform infrastructure via the Google Cloud Node.js SDK.

## Capabilities

- **Compute Engine**: List instances across zones, start/stop/reset, describe instance details
- **GKE**: List clusters across regions, describe cluster with node pool details
- **Cloud Storage**: List buckets with location and storage class info

## Credentials

- `COSI_SECRET_GCP_PROJECT_ID` — your GCP project ID
- `COSI_SECRET_GCP_CREDENTIALS_JSON` — JSON content of a service account key file

If running on GCP infrastructure (GCE, GKE, Cloud Run), credentials can be omitted and the SDK will use the workload identity / metadata server automatically.

## Setup

1. Create a service account with Compute Viewer, Container Viewer, and Storage Object Viewer roles
2. Download the key file: `gcloud iam service-accounts keys create key.json --iam-account=<sa>@<project>.iam.gserviceaccount.com`
3. Enable this cosita and add your secrets via Cosi Settings → Secrets:
   - `gcp/project-id` → your GCP project ID
   - `gcp/credentials-json` → paste the full contents of key.json
