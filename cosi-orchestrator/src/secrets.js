import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

let client = null;

function getClient() {
  if (!client) {
    client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-west-2" });
  }
  return client;
}

export function reinitialize() {
  client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-west-2" });
}

export async function getSecret(secretId) {
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await getClient().send(command);
  return response.SecretString;
}

export async function getToolSecrets(toolName, secretNames) {
  const secrets = {};
  const prefix = process.env.AWS_SECRET_PREFIX || "cosi/";

  for (const name of secretNames) {
    const path = `${prefix}${toolName}/${name}`;
    try {
      secrets[name] = await getSecret(path);
    } catch (err) {
      console.warn(`[secrets] Could not fetch secret ${path}: ${err.message}`);
      secrets[name] = null;
    }
  }

  return secrets;
}
