import Anthropic from "@anthropic-ai/sdk";

let client = null;

export function reinitialize() {
  client = null;
}

function getClient() {
  if (!client) {
    const apiKey = process.env.COSI_SECRET_AI_ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Anthropic API key not configured. Add it via Settings → AI Credentials.");
    client = new Anthropic({ apiKey });
  }
  return client;
}

function modelId() {
  return process.env.ANTHROPIC_MODEL_ID || "claude-sonnet-4-6";
}

function convertMessages(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: Array.isArray(msg.content)
      ? msg.content.map((b) => b.text || "").join("")
      : msg.content,
  }));
}

export async function* chatStream(messages, systemPrompt) {
  const stream = getClient().messages.stream({
    model: modelId(),
    max_tokens: 8192,
    system: systemPrompt,
    messages: convertMessages(messages),
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

export async function chat(messages, systemPrompt) {
  const response = await getClient().messages.create({
    model: modelId(),
    max_tokens: 16000,
    system: systemPrompt,
    messages: convertMessages(messages),
  });
  return response.content[0].text;
}
