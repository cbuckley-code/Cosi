import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
// Default TTL: 24 hours. Each access resets the TTL (sliding window).
const TTL = parseInt(process.env.SESSION_TTL_SECONDS || "86400", 10);

let redis = null;

function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
    redis.on("error", (err) => {
      console.warn("[session-store] Redis error:", err.message);
    });
  }
  return redis;
}

function sessionKey(sessionId, type) {
  return `cosi:session:${type}:${sessionId}`;
}

/**
 * Load a session. Returns { messages, compactedSummary } or null if not found.
 * - messages: Bedrock-format message array (recent, uncompacted)
 * - compactedSummary: string summary of earlier messages, or null
 */
export async function loadSession(sessionId, type = "builder") {
  const key = sessionKey(sessionId, type);
  try {
    const raw = await getRedis().get(key);
    if (!raw) return null;
    // Refresh TTL on access (sliding window)
    await getRedis().expire(key, TTL);
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[session-store] loadSession error:", err.message);
    return null;
  }
}

/**
 * Save a session. Overwrites the full session object.
 */
export async function saveSession(sessionId, type = "builder", session) {
  const key = sessionKey(sessionId, type);
  try {
    await getRedis().set(key, JSON.stringify(session), "EX", TTL);
  } catch (err) {
    console.warn("[session-store] saveSession error:", err.message);
  }
}

/**
 * Append messages to a session, loading existing state first.
 * Returns the updated session.
 */
export async function appendMessages(sessionId, type, newMessages) {
  const existing = (await loadSession(sessionId, type)) || {
    messages: [],
    compactedSummary: null,
    createdAt: new Date().toISOString(),
  };

  existing.messages = [...existing.messages, ...newMessages];
  existing.updatedAt = new Date().toISOString();

  await saveSession(sessionId, type, existing);
  return existing;
}

/**
 * Replace the messages array with a compacted version and store the summary.
 */
export async function compactSession(sessionId, type, keptMessages, summary) {
  const existing = (await loadSession(sessionId, type)) || {
    createdAt: new Date().toISOString(),
  };

  const updated = {
    ...existing,
    messages: keptMessages,
    compactedSummary: summary,
    lastCompactedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveSession(sessionId, type, updated);
  return updated;
}

/**
 * Delete a session (e.g., on explicit clear).
 */
export async function deleteSession(sessionId, type = "builder") {
  const key = sessionKey(sessionId, type);
  try {
    await getRedis().del(key);
  } catch (err) {
    console.warn("[session-store] deleteSession error:", err.message);
  }
}

/**
 * List all session IDs for a given type (for admin/debug use).
 */
export async function listSessions(type = "builder") {
  try {
    const keys = await getRedis().keys(`cosi:session:${type}:*`);
    return keys.map((k) => k.split(":").pop());
  } catch {
    return [];
  }
}
