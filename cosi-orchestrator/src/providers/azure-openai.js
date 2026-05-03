import { AzureOpenAI } from "openai";

let client = null;

export function reinitialize() {
  client = null;
}

function getClient() {
  if (!client) {
    const apiKey = process.env.COSI_SECRET_AI_AZURE_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview";
    if (!apiKey || !endpoint) {
      throw new Error("Azure OpenAI not configured. Set the endpoint in Settings and add the API key via AI Credentials.");
    }
    client = new AzureOpenAI({ apiKey, endpoint, apiVersion });
  }
  return client;
}

function deployment() {
  return process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";
}

function convertMessages(messages, systemPrompt) {
  const result = [];
  if (systemPrompt) result.push({ role: "system", content: systemPrompt });
  for (const msg of messages) {
    result.push({
      role: msg.role,
      content: Array.isArray(msg.content)
        ? msg.content.map((b) => b.text || "").join("")
        : msg.content,
    });
  }
  return result;
}

export async function* chatStream(messages, systemPrompt) {
  const stream = await getClient().chat.completions.create({
    model: deployment(),
    messages: convertMessages(messages, systemPrompt),
    max_tokens: 8192,
    stream: true,
  });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function chat(messages, systemPrompt) {
  const response = await getClient().chat.completions.create({
    model: deployment(),
    messages: convertMessages(messages, systemPrompt),
    max_tokens: 16000,
    stream: false,
  });
  return response.choices[0].message.content;
}
