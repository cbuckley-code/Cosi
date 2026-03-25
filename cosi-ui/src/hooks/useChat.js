import { useState, useCallback, useRef } from "react";

/**
 * Shared chat hook with SSE streaming support.
 *
 * @param {string} endpoint - The API endpoint to POST messages to
 * @param {string} systemContext - Optional system context for the chat
 */
export function useChat(endpoint) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || isStreaming) return;

      setError(null);

      // Add user message
      const userMessage = { role: "user", content: text, id: Date.now() };
      setMessages((prev) => [...prev, userMessage]);

      // Build conversation history for Bedrock (exclude current message)
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: [{ text: m.content }],
      }));

      setIsStreaming(true);
      setStatus(null);

      // Placeholder assistant message
      const assistantId = Date.now() + 1;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", id: assistantId, streaming: true },
      ]);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, conversationHistory }),
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
          buffer = lines.pop(); // Keep incomplete line

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

            if (event.type === "chunk") {
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
                    ? {
                        ...m,
                        streaming: false,
                        toolCreated,
                      }
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
    [endpoint, isStreaming, messages]
  );

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setStatus(null);
  }, []);

  return {
    messages,
    isStreaming,
    status,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}
