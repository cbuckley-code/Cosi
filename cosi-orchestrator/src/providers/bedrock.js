import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

let client = null;

export function reinitialize() {
  client = null;
}

function getClient() {
  if (!client) {
    client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-west-2",
    });
  }
  return client;
}

function modelId() {
  return process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-sonnet-4-6";
}

export async function* chatStream(messages, systemPrompt) {
  const command = new ConverseStreamCommand({
    modelId: modelId(),
    messages,
    system: systemPrompt ? [{ text: systemPrompt }] : undefined,
    inferenceConfig: { maxTokens: 8192 },
  });
  const response = await getClient().send(command);
  for await (const event of response.stream) {
    if (event.contentBlockDelta?.delta?.text) {
      yield event.contentBlockDelta.delta.text;
    }
  }
}

export async function chat(messages, systemPrompt) {
  const command = new ConverseCommand({
    modelId: modelId(),
    messages,
    system: systemPrompt ? [{ text: systemPrompt }] : undefined,
    inferenceConfig: { maxTokens: 16000 },
  });
  const response = await getClient().send(command);
  return response.output.message.content[0].text;
}
