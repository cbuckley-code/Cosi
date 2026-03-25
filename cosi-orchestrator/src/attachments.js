/**
 * Convert client attachment objects into Bedrock Converse API content blocks.
 *
 * Bedrock supports:
 *   - image blocks: { image: { format, source: { bytes } } }
 *       formats: jpeg, png, gif, webp
 *   - document blocks: { document: { format, name, source: { bytes } } }
 *       formats: pdf, txt, csv, md, html, doc, docx, xls, xlsx
 *   - text blocks: { text: "..." } — used for plain text files as a fallback
 *
 * @param {Array} attachments - [{ name, type, category, base64 }]
 * @returns {Array} Bedrock content blocks (excluding the user text block)
 */
export function buildAttachmentBlocks(attachments = []) {
  const blocks = [];

  for (const attachment of attachments) {
    const bytes = Buffer.from(attachment.base64, "base64");

    if (attachment.category === "image") {
      const format = imageFormat(attachment.type);
      if (!format) continue;
      blocks.push({
        image: {
          format,
          source: { bytes },
        },
      });
    } else if (attachment.category === "document") {
      const format = documentFormat(attachment.type, attachment.name);
      if (format) {
        blocks.push({
          document: {
            format,
            name: sanitizeDocName(attachment.name),
            source: { bytes },
          },
        });
      } else {
        // Fallback: decode as UTF-8 text and include inline
        const text = bytes.toString("utf8");
        blocks.push({
          text: `[File: ${attachment.name}]\n${text}`,
        });
      }
    }
  }

  return blocks;
}

/**
 * Build a complete Bedrock user message content array from text + attachments.
 * Text comes first, then attachment blocks.
 */
export function buildUserContent(text, attachments = []) {
  const content = [];

  if (text) {
    content.push({ text });
  }

  content.push(...buildAttachmentBlocks(attachments));

  return content;
}

// --- Helpers ---

const IMAGE_FORMAT_MAP = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

const DOCUMENT_FORMAT_MAP = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/markdown": "md",
  "text/html": "html",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// Extension fallbacks for when MIME type is generic (e.g. text/plain for .md)
const EXT_FORMAT_MAP = {
  ".md": "md",
  ".markdown": "md",
  ".txt": "txt",
  ".csv": "csv",
  ".pdf": "pdf",
  ".html": "html",
  ".htm": "html",
  ".doc": "doc",
  ".docx": "docx",
  ".xls": "xls",
  ".xlsx": "xlsx",
};

function imageFormat(mimeType) {
  return IMAGE_FORMAT_MAP[mimeType?.toLowerCase()] || null;
}

function documentFormat(mimeType, filename = "") {
  if (DOCUMENT_FORMAT_MAP[mimeType?.toLowerCase()]) {
    return DOCUMENT_FORMAT_MAP[mimeType.toLowerCase()];
  }
  // Try extension
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return EXT_FORMAT_MAP[ext] || null;
}

// Bedrock document names must be 1-100 chars, alphanumeric + hyphens
function sanitizeDocName(name) {
  return name
    .replace(/[^a-zA-Z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}
