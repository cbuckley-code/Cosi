import React from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }) {
  if (type === "image") {
    return <span style={{ fontSize: 20 }}>🖼</span>;
  }
  if (type === "document") {
    return <span style={{ fontSize: 20 }}>📄</span>;
  }
  return <span style={{ fontSize: 20 }}>📎</span>;
}

/**
 * Inline attachment chip shown in the input area before sending.
 */
export function AttachmentChip({ attachment, onRemove }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "#1a2a3a",
        border: "1px solid #37475a",
        borderRadius: 6,
        padding: "4px 6px 4px 8px",
        maxWidth: 200,
      }}
    >
      {attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 3 }}
        />
      ) : (
        <FileIcon type={attachment.category} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Box
          variant="small"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
          }}
        >
          {attachment.name}
        </Box>
        <Box variant="small" color="text-body-secondary">
          {formatBytes(attachment.size)}
        </Box>
      </div>
      {onRemove && (
        <button
          onClick={() => onRemove(attachment.id)}
          style={{
            background: "none",
            border: "none",
            color: "#8d9093",
            cursor: "pointer",
            padding: "0 2px",
            fontSize: 14,
            lineHeight: 1,
            flexShrink: 0,
          }}
          aria-label={`Remove ${attachment.name}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * Attachment rendered inside a chat message bubble.
 */
export function MessageAttachment({ attachment }) {
  if (attachment.category === "image" && attachment.previewUrl) {
    return (
      <div style={{ marginTop: 8 }}>
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          style={{
            maxWidth: "100%",
            maxHeight: 400,
            borderRadius: 6,
            border: "1px solid #37475a",
            display: "block",
          }}
        />
        <Box variant="small" color="text-body-secondary" padding={{ top: "xxs" }}>
          {attachment.name}
        </Box>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "#1a2a3a",
        border: "1px solid #37475a",
        borderRadius: 6,
        padding: "6px 10px",
        marginTop: 8,
      }}
    >
      <FileIcon type={attachment.category} />
      <div>
        <Box variant="small">{attachment.name}</Box>
        <Box variant="small" color="text-body-secondary">
          {formatBytes(attachment.size)}
        </Box>
      </div>
    </div>
  );
}

/**
 * Drag overlay shown over the chat window when dragging files.
 */
export function DragOverlay({ visible }) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 27, 45, 0.88)",
        border: "2px dashed #0972d3",
        borderRadius: 8,
        pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>📎</div>
      <Box variant="h3" color="text-status-info">
        Drop files here
      </Box>
      <Box color="text-body-secondary" padding={{ top: "xs" }}>
        Images, PDFs, and text files up to 10 MB
      </Box>
    </div>
  );
}
