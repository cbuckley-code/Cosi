# AWS Cosita

Runs AWS CLI v2 commands. Credentials are read from environment variables — no config file needed.

## Auth
Secrets required: `aws/access-key-id`, `aws/secret-access-key`, `aws/region`

## Useful commands

```
# EC2
aws ec2 describe-instances --output table
aws ec2 describe-instances --filters Name=instance-state-name,Values=running --output table
aws ec2 start-instances --instance-ids i-1234567890abcdef0
aws ec2 stop-instances --instance-ids i-1234567890abcdef0

# S3
aws s3 ls
aws s3 ls s3://my-bucket --recursive
aws s3 cp file.txt s3://my-bucket/
aws s3 sync . s3://my-bucket/prefix/

# EKS
aws eks list-clusters --region us-east-1
aws eks describe-cluster --name my-cluster --region us-east-1
aws eks update-kubeconfig --name my-cluster --region us-east-1

# RDS
aws rds describe-db-instances --output table
aws rds start-db-instance --db-instance-identifier mydb
aws rds create-db-snapshot --db-instance-identifier mydb --db-snapshot-identifier mydb-snap

# CloudFormation
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE
aws cloudformation describe-stacks --stack-name my-stack
aws cloudformation deploy --template-file template.yaml --stack-name my-stack

# Lambda
aws lambda list-functions --output table
aws lambda invoke --function-name my-fn --payload '{}' /tmp/out.json

# IAM
aws iam list-roles --query 'Roles[*].RoleName' --output table
aws iam get-role --role-name my-role

# CloudWatch
aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-xxx --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z --period 300 --statistics Average
```
