import { useState, useCallback, useRef } from "react";

/**
 * Chat hook with server-side session management via Redis.
 *
 * The server owns conversation history. The client tracks:
 * - Rendered messages (for display)
 * - A session ID (sent with every request)
 *
 * @param {string} endpoint - The API endpoint to POST messages to
 */
export function useChat(endpoint) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const sessionIdRef = useRef(null);
  const abortRef = useRef(null);

  /**
   * Send a message, optionally with file attachments.
   *
   * @param {string} text
   * @param {Array} attachments - [{ id, name, type, category, base64, previewUrl, size }]
   */
  const sendMessage = useCallback(
    async (text, attachments = []) => {
      if (!text.trim() || isStreaming) return;

      setError(null);

      // Render user message with any attachments
      const userMessage = {
        role: "user",
        content: text,
        id: Date.now(),
        attachments,
      };
      setMessages((prev) => [...prev, userMessage]);

      setIsStreaming(true);
      setStatus(null);

      const assistantId = Date.now() + 1;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", id: assistantId, streaming: true },
      ]);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        // Serialize attachments for the API — strip previewUrl (derived from base64)
        const serializedAttachments = attachments.map(({ id, name, type, category, base64 }) => ({
          id,
          name,
          type,
          category,
          base64,
        }));

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId: sessionIdRef.current,
            attachments: serializedAttachments,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let toolCreated = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            let event;
            try {
              event = JSON.parse(raw);
            } catch {
              continue;
            }

            if (event.type === "session") {
              sessionIdRef.current = event.sessionId;
            } else if (event.type === "chunk") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.text }
                    : m
                )
              );
            } else if (event.type === "status") {
              setStatus(event.message);
            } else if (event.type === "tool_created") {
              toolCreated = event;
            } else if (event.type === "error") {
              setError(event.message);
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, streaming: false, toolCreated }
                    : m
                )
              );
              setStatus(null);
            }
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, streaming: false, error: err.message }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        setStatus(null);
      }
    },
    [endpoint, isStreaming]
  );

  const stopStreaming = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const clearMessages = useCallback(async () => {
    const currentSessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    setMessages([]);
    setError(null);
    setStatus(null);

    if (currentSessionId) {
      const deleteEndpoint = endpoint.replace(/\/chat$/, `/session/${currentSessionId}`);
      try {
        await fetch(deleteEndpoint, { method: "DELETE" });
      } catch {
        // Non-fatal — session will expire via Redis TTL
      }
    }
  }, [endpoint]);

  return {
    messages,
    isStreaming,
    status,
    error,
    sessionId: sessionIdRef.current,
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}
