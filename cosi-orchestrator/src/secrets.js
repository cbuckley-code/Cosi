import fs from "fs/promises";

const SECRETS_FILE = process.env.SECRETS_FILE || "/app/secrets.env";

function parse(content) {
  const out = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1);
  }
  return out;
}

async function read() {
  try {
    return parse(await fs.readFile(SECRETS_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function write(secrets) {
  const lines = Object.entries(secrets).map(([k, v]) => `${k}=${v}`);
  await fs.writeFile(SECRETS_FILE, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
}

export async function getSecret(name) {
  return (await read())[name] ?? null;
}

export async function setSecret(name, value) {
  const secrets = await read();
  secrets[name] = value;
  await write(secrets);
}

export async function deleteSecret(name) {
  const secrets = await read();
  delete secrets[name];
  await write(secrets);
}

export async function listSecretNames() {
  return Object.keys(await read());
}

export async function getToolSecrets(toolName, secretNames) {
  const all = await read();
  const out = {};
  for (const name of secretNames) {
    const envKey = `COSI_SECRET_${name.replace(/[/\-]/g, "_").toUpperCase()}`;
    out[name] = all[envKey] ?? null;
  }
  return out;
}
