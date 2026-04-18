import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRETS_PATH =
  process.env.SECRETS_PATH || path.join(__dirname, "../../secrets.env");

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
    const secretPath = `${prefix}${toolName}/${name}`;
    try {
      secrets[name] = await getSecret(secretPath);
    } catch (err) {
      console.warn(`[secrets] Could not fetch secret ${secretPath}: ${err.message}`);
      secrets[name] = null;
    }
  }

  return secrets;
}

// ── Filesystem secret store (secrets.env) ────────────────────────────────────

async function readSecretsFile() {
  try {
    const content = await fs.readFile(SECRETS_PATH, "utf8");
    const map = new Map();
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      map.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1));
    }
    return map;
  } catch {
    return new Map();
  }
}

async function writeSecretsFile(map) {
  const lines = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`);
  const content = lines.length > 0 ? lines.join("\n") + "\n" : "";
  await fs.writeFile(SECRETS_PATH, content, { mode: 0o600 });
}

export async function listSecretNames() {
  const map = await readSecretsFile();
  return Array.from(map.keys());
}

export async function setSecret(name, value) {
  const map = await readSecretsFile();
  map.set(name, value);
  await writeSecretsFile(map);
}

export async function deleteSecret(name) {
  const map = await readSecretsFile();
  map.delete(name);
  await writeSecretsFile(map);
}
