import React, { useRef, useEffect, useState, useCallback } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import ChatMessage from "./ChatMessage.jsx";
import ToolRegistry from "./ToolRegistry.jsx";
import { AttachmentChip, DragOverlay } from "./FileAttachment.jsx";
import { useChat } from "../hooks/useChat.js";
import { useFileDropzone } from "../hooks/useFileDropzone.js";
import { useSpeechToText } from "../hooks/useSpeechToText.js";
import { MicButton } from "./MicButton.jsx";

export default function Chat() {
  const [inputValue, setInputValue] = useState("");
  const [showTools, setShowTools] = useState(false);
  const messagesEndRef = useRef(null);

  const { messages, isStreaming, status, error, sendMessage, clearMessages } =
    useChat("/api/chat");

  const {
    isDragging,
    attachments,
    errors: dropErrors,
    dragProps,
    removeAttachment,
    clearAttachments,
    openFilePicker,
    fileInputRef,
    onFileInputChange,
  } = useFileDropzone();

  const handleSpeechTranscript = useCallback(
    (oldInterim, finalText, newInterim) => {
      setInputValue((prev) => {
        const base = oldInterim
          ? prev.slice(0, prev.length - oldInterim.length)
          : prev;
        if (finalText !== null && finalText !== undefined) {
          return base + finalText + " ";
        }
        return base + (newInterim || "");
      });
    },
    []
  );

  const {
    isListening,
    isSupported,
    error: micError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText(handleSpeechTranscript);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if ((!inputValue.trim() && attachments.length === 0) || isStreaming) return;
    sendMessage(inputValue.trim(), attachments);
    setInputValue("");
    clearAttachments();
  };

  const handleKeyDown = (event) => {
    if (event.detail.key === "Enter" && !event.detail.shiftKey) {
      handleSend();
    }
  };

  const handleClear = () => {
    clearMessages();
    clearAttachments();
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main chat area */}
      <div
        className="chat-container"
        style={{ flex: 1, position: "relative" }}
        {...dragProps}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.md"
          style={{ display: "none" }}
          onChange={onFileInputChange}
        />

        <DragOverlay visible={isDragging} />

        {/* Header */}
        <Box padding={{ horizontal: "l", vertical: "s" }}>
          <SpaceBetween direction="horizontal" size="s" alignItems="center">
            <Box variant="h3">Cosi</Box>
            <Box variant="small" color="text-body-secondary">
              Chat with your tools or ask me to build new ones
            </Box>
            <SpaceBetween direction="horizontal" size="xs">
              {messages.length > 0 && (
                <Button variant="link" onClick={handleClear}>
                  Clear
                </Button>
              )}
              <Button variant="link" onClick={() => setShowTools((s) => !s)}>
                {showTools ? "Hide Tools" : "Tools"}
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        </Box>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <Box textAlign="center" color="text-body-secondary" padding="l">
              <SpaceBetween size="s">
                <Box variant="h4">What can I help you with?</Box>
                <Box>
                  Chat with your registered tools, or ask me to build a new one.
                </Box>
                <Box fontStyle="italic" color="text-body-secondary">
                  "Search our Jira board for open P1 bugs" ·{" "}
                  "Build a tool that integrates with GitHub Issues"
                </Box>
                <Box variant="small">
                  Drop images or files into the chat to include them.
                </Box>
              </SpaceBetween>
            </Box>
          )}

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {status && (
            <Box padding="s">
              <StatusIndicator type="loading">{status}</StatusIndicator>
            </Box>
          )}

          {error && (
            <Box padding="s">
              <StatusIndicator type="error">{error}</StatusIndicator>
            </Box>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Drop errors */}
        {dropErrors.length > 0 && (
          <Box padding={{ horizontal: "l" }}>
            <SpaceBetween size="xxs">
              {dropErrors.map((e, i) => (
                <StatusIndicator key={i} type="error">
                  {e}
                </StatusIndicator>
              ))}
            </SpaceBetween>
          </Box>
        )}

        {/* Attachment strip */}
        {attachments.length > 0 && (
          <div
            style={{
              padding: "8px 16px 0",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={removeAttachment}
              />
            ))}
          </div>
        )}

        {micError && (
          <Box padding={{ horizontal: "l" }}>
            <StatusIndicator type="error">{micError}</StatusIndicator>
          </Box>
        )}

        {/* Input */}
        <div className="chat-input-area">
          <div className="chat-input-container">
            <textarea
              className="chat-textarea"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a question"
              disabled={isStreaming}
              rows={1}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 160) + "px";
              }}
            />
            <div className="chat-input-controls">
              <div className="chat-input-controls-left">
                <button
                  className="chat-icon-btn"
                  onClick={openFilePicker}
                  disabled={isStreaming}
                  aria-label="Attach file"
                  title="Attach file"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>
                {isSupported && (
                  <MicButton
                    isListening={isListening}
                    disabled={isStreaming}
                    onStart={startListening}
                    onStop={stopListening}
                  />
                )}
              </div>
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={
                  (!inputValue.trim() && attachments.length === 0) || isStreaming
                }
                aria-label="Send message"
                title="Send message"
              >
                {isStreaming ? (
                  <span className="chat-send-spinner" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible tool registry panel */}
      {showTools && (
        <div
          style={{
            width: 300,
            borderLeft:
              "1px solid var(--color-border-divider-default, #414d5c)",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <ToolRegistry />
        </div>
      )}
    </div>
  );
}
