// OCI Generative AI — uses OCI request signing (RSA-SHA256).
// Credentials are read from secrets: tenancy OCID, user OCID, fingerprint, private key.
import crypto from "crypto";

export function reinitialize() {
  // No cached client; config is read fresh each call.
}

function getConfig() {
  const tenancy     = process.env.COSI_SECRET_AI_OCI_TENANCY_OCID;
  const user        = process.env.COSI_SECRET_AI_OCI_USER_OCID;
  const fingerprint = process.env.COSI_SECRET_AI_OCI_FINGERPRINT;
  const privateKey  = (process.env.COSI_SECRET_AI_OCI_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const endpoint    = process.env.OCI_GENAI_ENDPOINT
    || "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com";
  const compartmentId = process.env.OCI_COMPARTMENT_ID;
  const model       = process.env.OCI_MODEL_ID || "meta.llama-3.3-70b-instruct";

  if (!tenancy || !user || !fingerprint || !privateKey) {
    throw new Error("OCI credentials not configured. Add them via Settings → AI Credentials.");
  }
  if (!compartmentId) {
    throw new Error("OCI compartment ID not configured. Set it in Settings.");
  }

  return { tenancy, user, fingerprint, privateKey, endpoint, compartmentId, model };
}

function buildAuthHeader(method, path, host, headers, config) {
  const sigHeaders = "date (request-target) host content-type content-length x-content-sha256";
  const parts = [
    `date: ${headers.date}`,
    `(request-target): ${method.toLowerCase()} ${path}`,
    `host: ${host}`,
    `content-type: ${headers["content-type"]}`,
    `content-length: ${headers["content-length"]}`,
    `x-content-sha256: ${headers["x-content-sha256"]}`,
  ];
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(parts.join("\n"));
  const sig = sign.sign(config.privateKey, "base64");
  return (
    `Signature version="1",` +
    `headers="${sigHeaders}",` +
    `keyId="${config.tenancy}/${config.user}/${config.fingerprint}",` +
    `algorithm="rsa-sha256",` +
    `signature="${sig}"`
  );
}

async function ociPost(config, bodyObj) {
  const url = new URL(`${config.endpoint}/20231130/actions/chat`);
  const bodyStr = JSON.stringify(bodyObj);
  const bodyHash = crypto.createHash("sha256").update(bodyStr).digest("base64");
  const date = new Date().toUTCString();

  const headers = {
    date,
    host: url.hostname,
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(bodyStr)),
    "x-content-sha256": bodyHash,
  };
  headers.authorization = buildAuthHeader("POST", url.pathname, url.hostname, headers, config);

  const res = await fetch(`${url.origin}${url.pathname}`, {
    method: "POST",
    headers,
    body: bodyStr,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OCI GenAI error ${res.status}: ${text}`);
  }
  return res.json();
}

function convertMessages(messages) {
  return messages.map((msg) => ({
    role: msg.role === "assistant" ? "CHATBOT" : "USER",
    content: [
      {
        type: "TEXT",
        text: Array.isArray(msg.content)
          ? msg.content.map((b) => b.text || "").join("")
          : msg.content,
      },
    ],
  }));
}

export async function* chatStream(messages, systemPrompt) {
  // OCI GenAI streaming requires SSE handling; fall back to non-streaming for simplicity.
  const text = await chat(messages, systemPrompt);
  yield text;
}

export async function chat(messages, systemPrompt) {
  const config = getConfig();
  const allMessages = systemPrompt
    ? [{ role: "SYSTEM", content: [{ type: "TEXT", text: systemPrompt }] }, ...convertMessages(messages)]
    : convertMessages(messages);

  const body = {
    compartmentId: config.compartmentId,
    servingMode: { modelId: config.model, servingType: "ON_DEMAND" },
    chatRequest: {
      messages: allMessages,
      maxTokens: 8192,
      apiFormat: "GENERIC",
    },
  };

  const response = await ociPost(config, body);
  return response.chatResponse?.choices?.[0]?.message?.content?.[0]?.text ?? "";
}
