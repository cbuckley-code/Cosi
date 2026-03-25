import React, { useRef, useEffect, useState } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Input from "@cloudscape-design/components/input";
import Button from "@cloudscape-design/components/button";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import ChatMessage from "./ChatMessage.jsx";
import ToolRegistry from "./ToolRegistry.jsx";
import { useChat } from "../hooks/useChat.js";

export default function UserChat() {
  const [inputValue, setInputValue] = useState("");
  const [showTools, setShowTools] = useState(true);
  const messagesEndRef = useRef(null);
  const { messages, isStreaming, status, error, sendMessage, clearMessages } =
    useChat("/api/user/chat");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim() || isStreaming) return;
    sendMessage(inputValue.trim());
    setInputValue("");
  };

  const handleKeyDown = (event) => {
    if (event.detail.key === "Enter" && !event.detail.shiftKey) {
      handleSend();
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main chat area */}
      <div className="chat-container" style={{ flex: 1 }}>
        <Box padding={{ horizontal: "l", vertical: "s" }}>
          <SpaceBetween direction="horizontal" size="s" alignItems="center">
            <Box variant="h3">Chat</Box>
            <Box variant="small" color="text-body-secondary">
              Chat with your tools via Cosi
            </Box>
            <SpaceBetween direction="horizontal" size="xs">
              {messages.length > 0 && (
                <Button variant="link" onClick={clearMessages}>
                  Clear
                </Button>
              )}
              <Button
                variant="link"
                onClick={() => setShowTools(!showTools)}
              >
                {showTools ? "Hide Tools" : "Show Tools"}
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        </Box>

        <div className="chat-messages">
          {messages.length === 0 && (
            <Box textAlign="center" color="text-body-secondary" padding="l">
              <SpaceBetween size="s">
                <Box variant="h4">Start chatting with your tools</Box>
                <Box>
                  Ask questions or give commands and Cosi will use your
                  registered tools to help.
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

        <div className="chat-input-area">
          <SpaceBetween direction="horizontal" size="s">
            <div style={{ flex: 1 }}>
              <Input
                value={inputValue}
                onChange={({ detail }) => setInputValue(detail.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question or give a command..."
                disabled={isStreaming}
              />
            </div>
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={!inputValue.trim() || isStreaming}
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
            width: "280px",
            borderLeft: "1px solid #232f3e",
            overflow: "auto",
            padding: "16px",
            flexShrink: 0,
          }}
        >
          <ToolRegistry />
        </div>
      )}
    </div>
  );
}
