import React, { useRef, useEffect, useState } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Input from "@cloudscape-design/components/input";
import Button from "@cloudscape-design/components/button";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import ChatMessage from "./ChatMessage.jsx";
import { useChat } from "../hooks/useChat.js";

export default function BuilderChat() {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef(null);
  const { messages, isStreaming, status, error, sendMessage, clearMessages } =
    useChat("/api/builder/chat");

  // Auto-scroll to bottom
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
    <div className="chat-container">
      {/* Header */}
      <Box padding={{ horizontal: "l", vertical: "s" }}>
        <SpaceBetween direction="horizontal" size="s" alignItems="center">
          <Box variant="h3">Builder Chat</Box>
          <Box variant="small" color="text-body-secondary">
            Describe the tool you want to create
          </Box>
          {messages.length > 0 && (
            <Button variant="link" onClick={clearMessages}>
              Clear
            </Button>
          )}
        </SpaceBetween>
      </Box>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <Box textAlign="center" color="text-body-secondary" padding="l">
            <SpaceBetween size="s">
              <Box variant="h4">Welcome to Cosi Builder</Box>
              <Box>
                Describe the tool you want to create. For example:
              </Box>
              <Box fontStyle="italic">
                "I want a tool that integrates with our Jira instance to search
                and create issues using API tokens."
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

      {/* Input */}
      <div className="chat-input-area">
        <SpaceBetween direction="horizontal" size="s">
          <div style={{ flex: 1 }}>
            <Input
              value={inputValue}
              onChange={({ detail }) => setInputValue(detail.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the tool you want to build..."
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
  );
}
