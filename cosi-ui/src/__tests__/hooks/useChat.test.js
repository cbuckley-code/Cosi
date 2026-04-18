import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChat } from "../../hooks/useChat.js";

const ENDPOINT = "/api/chat";

/**
 * Build a mock fetch Response whose body streams SSE events.
 * Each event object is serialised as `data: <json>\n\n`.
 */
function makeSseResponse(events) {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("useChat", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has correct initial state", () => {
    const { result } = renderHook(() => useChat(ENDPOINT));

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe(null);
    expect(result.current.sessionId).toBe(null);
  });

  it("adds user message and assistant placeholder when sendMessage is called", async () => {
    fetch.mockResolvedValue(
      makeSseResponse([{ type: "done" }])
    );

    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    // After streaming completes there should be 2 messages
    const msgs = result.current.messages;
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hello");
    expect(msgs[1].role).toBe("assistant");
  });

  it("accumulates text from chunk events into the assistant message", async () => {
    fetch.mockResolvedValue(
      makeSseResponse([
        { type: "chunk", text: "Hello" },
        { type: "chunk", text: " world" },
        { type: "done" },
      ])
    );

    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant.content).toBe("Hello world");
    expect(assistant.streaming).toBe(false);
  });

  it("stores sessionId received from session event", async () => {
    const sid = "sess-abc-123";
    fetch.mockResolvedValue(
      makeSseResponse([
        { type: "session", sessionId: sid },
        { type: "done" },
      ])
    );

    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("Hey");
    });

    expect(result.current.sessionId).toBe(sid);
  });

  it("sends sessionId in subsequent requests once a session is established", async () => {
    const sid = "sess-xyz-789";

    fetch
      .mockResolvedValueOnce(
        makeSseResponse([{ type: "session", sessionId: sid }, { type: "done" }])
      )
      .mockResolvedValueOnce(makeSseResponse([{ type: "done" }]));

    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("First");
    });

    await act(async () => {
      await result.current.sendMessage("Second");
    });

    const secondCall = fetch.mock.calls[1];
    const body = JSON.parse(secondCall[1].body);
    expect(body.sessionId).toBe(sid);
  });

  it("sets status from status events", async () => {
    // We need to capture mid-stream state, so use a controlled stream
    let streamController;
    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
      },
    });
    const response = new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    fetch.mockResolvedValue(response);

    const encoder = new TextEncoder();
    const { result } = renderHook(() => useChat(ENDPOINT));

    // Start sending but don't await yet
    let sendPromise;
    act(() => {
      sendPromise = result.current.sendMessage("test");
    });

    // Push status event
    await act(async () => {
      const statusLine = `data: ${JSON.stringify({ type: "status", message: "Thinking..." })}\n\n`;
      streamController.enqueue(encoder.encode(statusLine));
    });

    await waitFor(() => expect(result.current.status).toBe("Thinking..."));

    // Close stream with done event
    await act(async () => {
      const doneLine = `data: ${JSON.stringify({ type: "done" })}\n\n`;
      streamController.enqueue(encoder.encode(doneLine));
      streamController.close();
      await sendPromise;
    });

    expect(result.current.status).toBe(null);
  });

  it("appends error to assistant message on error event", async () => {
    fetch.mockResolvedValue(
      makeSseResponse([
        { type: "error", message: "Something went wrong" },
        { type: "done" },
      ])
    );

    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(result.current.error).toBe("Something went wrong");
  });

  it("sets error and marks assistant message on HTTP error response", async () => {
    fetch.mockResolvedValue(
      new Response(null, { status: 500, statusText: "Internal Server Error" })
    );

    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(result.current.error).toBeTruthy();
    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant.streaming).toBe(false);
    expect(assistant.error).toBeTruthy();
  });

  it("does nothing when sendMessage is called with empty text", async () => {
    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it("does nothing when sendMessage is called while already streaming", async () => {
    // First request never resolves
    fetch.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useChat(ENDPOINT));

    // Start first send (won't complete)
    act(() => {
      result.current.sendMessage("First");
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    // Try to send while streaming
    await act(async () => {
      await result.current.sendMessage("Second");
    });

    // fetch should only have been called once
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("clearMessages resets messages, sessionId, and calls DELETE on the session", async () => {
    const sid = "sess-del-456";

    fetch
      .mockResolvedValueOnce(
        makeSseResponse([{ type: "session", sessionId: sid }, { type: "done" }])
      )
      // DELETE /api/session/:id
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(result.current.messages.length).toBe(2);
    expect(result.current.sessionId).toBe(sid);

    await act(async () => {
      await result.current.clearMessages();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.sessionId).toBe(null);

    // The DELETE call should have been made
    const deleteCalls = fetch.mock.calls.filter(
      ([, opts]) => opts && opts.method === "DELETE"
    );
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0][0]).toContain(sid);
  });

  it("clearMessages with no session does not call DELETE", async () => {
    fetch.mockResolvedValue(makeSseResponse([{ type: "done" }]));

    const { result } = renderHook(() => useChat(ENDPOINT));

    // Never send a message so session is never established
    await act(async () => {
      await result.current.clearMessages();
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks assistant message with toolCreated from tool_created event", async () => {
    const toolData = {
      type: "tool_created",
      toolName: "my-tool",
      files: ["index.js"],
      message: "Tool created successfully",
    };

    fetch.mockResolvedValue(
      makeSseResponse([
        { type: "tool_created", ...toolData },
        { type: "done" },
      ])
    );

    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("Build me a tool");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant.toolCreated).toBeDefined();
    expect(assistant.toolCreated.toolName).toBe("my-tool");
    expect(assistant.toolCreated.files).toEqual(["index.js"]);
  });

  it("sets isStreaming=false after stream completes", async () => {
    fetch.mockResolvedValue(makeSseResponse([{ type: "done" }]));

    const { result } = renderHook(() => useChat(ENDPOINT));

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(result.current.isStreaming).toBe(false);
  });
});
