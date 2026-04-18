# AWS Cosita

Manages AWS cloud infrastructure via the AWS SDK v3.

## Capabilities

- **EC2**: List instances (filtered by state), start/stop/reboot/terminate
- **S3**: List buckets, list/get/put/delete objects
- **EKS**: List clusters, describe cluster details
- **RDS**: List database instances with status and endpoint info
- **CloudWatch**: Get metric statistics for any namespace/metric over a time window

## Credentials

Reads from environment variables injected by Cosi:
- `COSI_SECRET_AWS_ACCESS_KEY_ID`
- `COSI_SECRET_AWS_SECRET_ACCESS_KEY`
- `COSI_SECRET_AWS_REGION` (default: us-east-1)

If running on an EC2 instance with an instance profile, access key / secret key can be omitted and the SDK will use the instance metadata service.

## Setup

Enable this cosita and add your secrets via the Cosi Settings → Secrets panel:
- `aws/access-key-id` → your AWS access key ID
- `aws/secret-access-key` → your AWS secret access key
- `aws/region` → your default AWS region (e.g. us-east-1)
