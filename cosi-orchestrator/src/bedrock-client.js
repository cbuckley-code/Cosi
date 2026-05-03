// Backwards-compatibility shim — delegates to ai-client.js.
// New code should import directly from ./ai-client.js.
export { chatStream, chat, reinitialize, getModelId } from "./ai-client.js";
