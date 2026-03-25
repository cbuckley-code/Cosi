import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Badge from "@cloudscape-design/components/badge";
import SpaceBetween from "@cloudscape-design/components/space-between";

function ToolCreatedCard({ toolCreated }) {
  return (
    <Container>
      <SpaceBetween size="xs">
        <Box variant="h4">
          <StatusIndicator type="success">Tool Created</StatusIndicator>
        </Box>
        <Box>
          <strong>Name:</strong> {toolCreated.toolName}
        </Box>
        <Box>
          <strong>Files:</strong>{" "}
          {toolCreated.files.map((f) => (
            <Badge key={f} color="blue">
              {f}
            </Badge>
          ))}
        </Box>
        <Box variant="small" color="text-body-secondary">
          {toolCreated.message}
        </Box>
      </SpaceBetween>
    </Container>
  );
}

function ToolCallCard({ toolCall }) {
  return (
    <ExpandableSection headerText={`Tool: ${toolCall.name}`} variant="footer">
      <div className="tool-call-card">
        <div>
          <strong>Input:</strong>
          <pre>{JSON.stringify(toolCall.input, null, 2)}</pre>
        </div>
        {toolCall.output && (
          <div>
            <strong>Output:</strong>
            <pre>{typeof toolCall.output === "string" ? toolCall.output : JSON.stringify(toolCall.output, null, 2)}</pre>
          </div>
        )}
      </div>
    </ExpandableSection>
  );
}

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";

  const containerStyle = {
    maxWidth: isUser ? "70%" : "85%",
    alignSelf: isUser ? "flex-end" : "flex-start",
    marginLeft: isUser ? "auto" : "0",
    marginRight: isUser ? "0" : "auto",
  };

  const headerText = isUser ? "You" : "Cosi";

  return (
    <div style={containerStyle}>
      <Container
        header={
          <Box variant="small" color="text-body-secondary">
            {headerText}
          </Box>
        }
      >
        <SpaceBetween size="s">
          {message.streaming && !message.content ? (
            <StatusIndicator type="loading">Thinking...</StatusIndicator>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}

          {message.streaming && message.content && (
            <StatusIndicator type="loading" />
          )}

          {message.toolCalls?.map((tc, i) => (
            <ToolCallCard key={i} toolCall={tc} />
          ))}

          {message.toolCreated && (
            <ToolCreatedCard toolCreated={message.toolCreated} />
          )}

          {message.error && (
            <StatusIndicator type="error">{message.error}</StatusIndicator>
          )}
        </SpaceBetween>
      </Container>
    </div>
  );
}
