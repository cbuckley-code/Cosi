const BUILDER_URL = process.env.BUILDER_URL || "http://cosi-builder:3001";
const TIMEOUT_MS = 5 * 60 * 1000; // 5 min — build + start + checks can take a while

/**
 * Ask the builder sidecar to validate generated tool files by building the
 * Docker image, starting the container, and running health + MCP checks.
 *
 * Returns null if the builder is unreachable (validation is skipped gracefully).
 * Returns { success, logs, error? } on a completed validation attempt.
 *
 * @param {string} toolName
 * @param {Record<string, string|object>} files
 * @returns {Promise<{ success: boolean, logs: string[], error?: string } | null>}
 */
export async function validateGeneratedTool(toolName, files) {
  try {
    const response = await fetch(`${BUILDER_URL}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolName, files }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(
        `[tool-validator] Builder returned ${response.status} — skipping validation`
      );
      return null;
    }

    return await response.json();
  } catch (err) {
    // Builder not available (not yet deployed locally, etc.) — skip gracefully
    console.warn(`[tool-validator] Builder unreachable, skipping validation: ${err.message}`);
    return null;
  }
}
