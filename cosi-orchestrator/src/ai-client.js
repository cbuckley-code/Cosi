// Provider-agnostic AI client.
// All code that talks to an LLM should import from here, not from bedrock-client.js.
// Provider is selected by the AI_PROVIDER env var (set when settings are saved).

// Lazy-loaded provider modules
const providers = {};

async function load(name) {
  if (!providers[name]) {
    providers[name] = await import(`./providers/${name}.js`);
  }
  return providers[name];
}

function providerName() {
  return process.env.AI_PROVIDER || "bedrock";
}

export async function reinitialize() {
  for (const mod of Object.values(providers)) {
    mod.reinitialize();
  }
}

export async function* chatStream(messages, systemPrompt) {
  const provider = await load(providerName());
  yield* provider.chatStream(messages, systemPrompt);
}

export async function chat(messages, systemPrompt) {
  const provider = await load(providerName());
  return provider.chat(messages, systemPrompt);
}

export function getModelId() {
  switch (providerName()) {
    case "anthropic":    return process.env.ANTHROPIC_MODEL_ID    || "claude-sonnet-4-6";
    case "azure-openai": return process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";
    case "vertex":       return process.env.VERTEX_MODEL_ID        || "gemini-2.0-flash";
    case "oci":          return process.env.OCI_MODEL_ID           || "meta.llama-3.3-70b-instruct";
    default:             return process.env.BEDROCK_MODEL_ID       || "us.anthropic.claude-sonnet-4-6";
  }
}
