import React, { useRef, useEffect, useState } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Input from "@cloudscape-design/components/input";
import Button from "@cloudscape-design/components/button";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import ChatMessage from "./ChatMessage.jsx";
import ToolRegistry from "./ToolRegistry.jsx";
import { AttachmentChip, DragOverlay } from "./FileAttachment.jsx";
import { useChat } from "../hooks/useChat.js";
import { useFileDropzone } from "../hooks/useFileDropzone.js";

export default function UserChat() {
  const [inputValue, setInputValue] = useState("");
  const [showTools, setShowTools] = useState(true);
  const messagesEndRef = useRef(null);
  const { messages, isStreaming, status, error, sendMessage, clearMessages } =
    useChat("/api/user/chat");

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
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.md"
          style={{ display: "none" }}
          onChange={onFileInputChange}
        />

        {/* Drag overlay */}
        <DragOverlay visible={isDragging} />

        {/* Header */}
        <Box padding={{ horizontal: "l", vertical: "s" }}>
          <SpaceBetween direction="horizontal" size="s" alignItems="center">
            <Box variant="h3">Chat</Box>
            <Box variant="small" color="text-body-secondary">
              Chat with your tools via Cosi
            </Box>
            <SpaceBetween direction="horizontal" size="xs">
              {messages.length > 0 && (
                <Button variant="link" onClick={handleClear}>
                  Clear
                </Button>
              )}
              <Button variant="link" onClick={() => setShowTools(!showTools)}>
                {showTools ? "Hide Tools" : "Show Tools"}
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        </Box>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <Box textAlign="center" color="text-body-secondary" padding="l">
              <SpaceBetween size="s">
                <Box variant="h4">Start chatting with your tools</Box>
                <Box>
                  Ask questions or give commands and Cosi will use your
                  registered tools to help.
                </Box>
                <Box variant="small">
                  Drag and drop images or files to include them in your message.
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

        {/* Attachment preview strip */}
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
              <AttachmentChip key={a.id} attachment={a} onRemove={removeAttachment} />
            ))}
          </div>
        )}

        {/* Input */}
        <div className="chat-input-area">
          <SpaceBetween direction="horizontal" size="s">
            <Button
              variant="icon"
              iconName="upload"
              onClick={openFilePicker}
              disabled={isStreaming}
              ariaLabel="Attach file"
            />
            <div style={{ flex: 1 }}>
              <Input
                value={inputValue}
                onChange={({ detail }) => setInputValue(detail.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question or drop files here..."
                disabled={isStreaming}
              />
            </div>
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={(!inputValue.trim() && attachments.length === 0) || isStreaming}
              loading={isStreaming}
            >
              Send
            </Button>
          </SpaceBetween>
        </div>
      </div>

      {/* Tools sidebar */}
      {showTools && (
        <div
          style={{
            width: 280,
            borderLeft: "1px solid #232f3e",
            overflow: "auto",
            padding: 16,
            flexShrink: 0,
          }}
        >
          <ToolRegistry />
        </div>
      )}
    </div>
  );
}
