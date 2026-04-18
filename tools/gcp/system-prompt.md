# GCP Cosita

Runs Google Cloud CLI (gcloud) commands. Activates a service account from credentials JSON at startup.

## Auth
Secrets required: `gcp/project-id`, `gcp/credentials-json` (full JSON content of service account key file)

Create key: `gcloud iam service-accounts keys create key.json --iam-account=sa@project.iam.gserviceaccount.com`

## Useful commands

```
# Compute Engine
gcloud compute instances list --format table
gcloud compute instances describe my-vm --zone us-central1-a
gcloud compute instances start my-vm --zone us-central1-a
gcloud compute instances stop my-vm --zone us-central1-a
gcloud compute ssh my-vm --zone us-central1-a --command "uptime"

# GKE
gcloud container clusters list
gcloud container clusters describe my-cluster --region us-central1
gcloud container clusters get-credentials my-cluster --region us-central1
gcloud container clusters resize my-cluster --num-nodes=5 --region us-central1

# Cloud Storage
gcloud storage ls
gcloud storage ls gs://my-bucket
gcloud storage cp file.txt gs://my-bucket/
gcloud storage cat gs://my-bucket/file.txt

# Cloud Run
gcloud run services list --platform managed
gcloud run services describe my-service --platform managed --region us-central1
gcloud run deploy my-service --image gcr.io/myproject/myimage --platform managed --region us-central1

# IAM
gcloud projects get-iam-policy my-project
gcloud iam service-accounts list

# Cloud Functions
gcloud functions list
gcloud functions describe my-function
```
