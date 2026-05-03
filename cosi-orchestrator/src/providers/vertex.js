// Google Vertex AI via the Gemini OpenAI-compatible endpoint.
// API key comes from Google AI Studio (https://aistudio.google.com).
import OpenAI from "openai";

let client = null;

export function reinitialize() {
  client = null;
}

function getClient() {
  if (!client) {
    const apiKey = process.env.COSI_SECRET_AI_VERTEX_API_KEY;
    if (!apiKey) {
      throw new Error("Google AI API key not configured. Add it via Settings → AI Credentials.");
    }
    client = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }
  return client;
}

function modelId() {
  return process.env.VERTEX_MODEL_ID || "gemini-2.0-flash";
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
    model: modelId(),
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
    model: modelId(),
    messages: convertMessages(messages, systemPrompt),
    max_tokens: 16000,
    stream: false,
  });
  return response.choices[0].message.content;
}
