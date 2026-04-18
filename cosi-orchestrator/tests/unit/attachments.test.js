import { describe, it, expect } from "vitest";
import {
  buildAttachmentBlocks,
  buildUserContent,
} from "../../src/attachments.js";

// Helper to create a base64 string from arbitrary text
function toBase64(str) {
  return Buffer.from(str).toString("base64");
}

describe("buildAttachmentBlocks", () => {
  describe("image category", () => {
    it("produces an image block for image/jpeg", () => {
      const blocks = buildAttachmentBlocks([
        { name: "photo.jpg", type: "image/jpeg", category: "image", base64: toBase64("imgdata") },
      ]);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        image: { format: "jpeg", source: { bytes: expect.any(Buffer) } },
      });
    });

    it("produces an image block for image/jpg (alias)", () => {
      const blocks = buildAttachmentBlocks([
        { name: "photo.jpg", type: "image/jpg", category: "image", base64: toBase64("imgdata") },
      ]);
      expect(blocks[0].image.format).toBe("jpeg");
    });

    it("produces an image block for image/png", () => {
      const blocks = buildAttachmentBlocks([
        { name: "img.png", type: "image/png", category: "image", base64: toBase64("png") },
      ]);
      expect(blocks[0].image.format).toBe("png");
    });

    it("produces an image block for image/gif", () => {
      const blocks = buildAttachmentBlocks([
        { name: "anim.gif", type: "image/gif", category: "image", base64: toBase64("gif") },
      ]);
      expect(blocks[0].image.format).toBe("gif");
    });

    it("produces an image block for image/webp", () => {
      const blocks = buildAttachmentBlocks([
        { name: "img.webp", type: "image/webp", category: "image", base64: toBase64("webp") },
      ]);
      expect(blocks[0].image.format).toBe("webp");
    });

    it("skips image with unknown MIME type", () => {
      const blocks = buildAttachmentBlocks([
        { name: "img.tiff", type: "image/tiff", category: "image", base64: toBase64("tiff") },
      ]);
      expect(blocks).toHaveLength(0);
    });

    it("source bytes match the decoded base64 data", () => {
      const data = "hello image";
      const blocks = buildAttachmentBlocks([
        { name: "img.png", type: "image/png", category: "image", base64: toBase64(data) },
      ]);
      expect(blocks[0].image.source.bytes).toEqual(Buffer.from(data));
    });
  });

  describe("document category — MIME type mapping", () => {
    const docCases = [
      ["application/pdf", "pdf"],
      ["text/plain", "txt"],
      ["text/csv", "csv"],
      ["text/markdown", "md"],
      ["text/html", "html"],
      ["application/msword", "doc"],
      ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
      ["application/vnd.ms-excel", "xls"],
      ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
    ];

    for (const [mimeType, expectedFormat] of docCases) {
      it(`maps ${mimeType} → ${expectedFormat}`, () => {
        const blocks = buildAttachmentBlocks([
          { name: `file.${expectedFormat}`, type: mimeType, category: "document", base64: toBase64("data") },
        ]);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
          document: { format: expectedFormat, source: { bytes: expect.any(Buffer) } },
        });
      });
    }

    it("includes document name in the block", () => {
      const blocks = buildAttachmentBlocks([
        { name: "report.pdf", type: "application/pdf", category: "document", base64: toBase64("pdf") },
      ]);
      expect(blocks[0].document.name).toBe("report.pdf");
    });
  });

  describe("document category — extension fallback", () => {
    it("uses extension .md when MIME is generic (application/octet-stream)", () => {
      const blocks = buildAttachmentBlocks([
        { name: "README.md", type: "application/octet-stream", category: "document", base64: toBase64("# doc") },
      ]);
      expect(blocks[0]).toHaveProperty("document");
      expect(blocks[0].document.format).toBe("md");
    });

    it("uses extension .markdown as md", () => {
      const blocks = buildAttachmentBlocks([
        { name: "notes.markdown", type: "application/octet-stream", category: "document", base64: toBase64("text") },
      ]);
      expect(blocks[0].document.format).toBe("md");
    });

    it("uses extension .htm as html", () => {
      const blocks = buildAttachmentBlocks([
        { name: "page.htm", type: "application/octet-stream", category: "document", base64: toBase64("html") },
      ]);
      expect(blocks[0].document.format).toBe("html");
    });

    it("uses extension .csv when MIME is generic", () => {
      const blocks = buildAttachmentBlocks([
        { name: "data.csv", type: "application/octet-stream", category: "document", base64: toBase64("a,b") },
      ]);
      expect(blocks[0].document.format).toBe("csv");
    });
  });

  describe("document category — text fallback", () => {
    it("falls back to text block for unknown MIME and unknown extension", () => {
      const content = "some binary content";
      const blocks = buildAttachmentBlocks([
        { name: "mystery.xyz", type: "application/octet-stream", category: "document", base64: toBase64(content) },
      ]);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toHaveProperty("text");
      expect(blocks[0].text).toContain("[File: mystery.xyz]");
      expect(blocks[0].text).toContain(content);
    });

    it("text fallback format is [File: name]\\n<content>", () => {
      const content = "plain text content";
      const blocks = buildAttachmentBlocks([
        { name: "notes.abc", type: "application/xyz", category: "document", base64: toBase64(content) },
      ]);
      expect(blocks[0].text).toBe(`[File: notes.abc]\n${content}`);
    });
  });

  describe("sanitizeDocName", () => {
    it("replaces spaces with hyphens", () => {
      const blocks = buildAttachmentBlocks([
        { name: "my file name.pdf", type: "application/pdf", category: "document", base64: toBase64("data") },
      ]);
      expect(blocks[0].document.name).toBe("my-file-name.pdf");
    });

    it("collapses multiple hyphens", () => {
      const blocks = buildAttachmentBlocks([
        { name: "my  file.pdf", type: "application/pdf", category: "document", base64: toBase64("data") },
      ]);
      // two spaces → two hyphens → collapsed to one
      expect(blocks[0].document.name).toBe("my-file.pdf");
    });

    it("truncates name to 100 characters", () => {
      const longName = "a".repeat(120) + ".pdf";
      const blocks = buildAttachmentBlocks([
        { name: longName, type: "application/pdf", category: "document", base64: toBase64("data") },
      ]);
      expect(blocks[0].document.name.length).toBeLessThanOrEqual(100);
    });

    it("preserves alphanumeric, dots, hyphens, underscores", () => {
      const blocks = buildAttachmentBlocks([
        { name: "my_doc-v1.2.pdf", type: "application/pdf", category: "document", base64: toBase64("data") },
      ]);
      expect(blocks[0].document.name).toBe("my_doc-v1.2.pdf");
    });

    it("replaces special characters with hyphen", () => {
      const blocks = buildAttachmentBlocks([
        { name: "file@2024!.pdf", type: "application/pdf", category: "document", base64: toBase64("data") },
      ]);
      expect(blocks[0].document.name).toContain("file");
      expect(blocks[0].document.name).toMatch(/^[a-zA-Z0-9.\-_]+$/);
    });
  });

  describe("empty and edge cases", () => {
    it("returns [] for empty attachments array", () => {
      expect(buildAttachmentBlocks([])).toEqual([]);
    });

    it("returns [] when called with no arguments", () => {
      expect(buildAttachmentBlocks()).toEqual([]);
    });

    it("handles multiple attachments of mixed types", () => {
      const blocks = buildAttachmentBlocks([
        { name: "img.png", type: "image/png", category: "image", base64: toBase64("png") },
        { name: "doc.pdf", type: "application/pdf", category: "document", base64: toBase64("pdf") },
      ]);
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toHaveProperty("image");
      expect(blocks[1]).toHaveProperty("document");
    });
  });
});

describe("buildUserContent", () => {
  it("puts text block first", () => {
    const content = buildUserContent("hello", [
      { name: "img.png", type: "image/png", category: "image", base64: toBase64("png") },
    ]);
    expect(content[0]).toEqual({ text: "hello" });
  });

  it("puts attachment blocks after text", () => {
    const content = buildUserContent("hi", [
      { name: "img.png", type: "image/png", category: "image", base64: toBase64("png") },
    ]);
    expect(content[1]).toHaveProperty("image");
  });

  it("returns only text block when no attachments", () => {
    const content = buildUserContent("just text");
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({ text: "just text" });
  });

  it("returns only attachment blocks when text is empty string", () => {
    const content = buildUserContent("", [
      { name: "img.png", type: "image/png", category: "image", base64: toBase64("png") },
    ]);
    // empty string is falsy — no text block added
    expect(content).toHaveLength(1);
    expect(content[0]).toHaveProperty("image");
  });

  it("returns empty array when no text and no attachments", () => {
    const content = buildUserContent("", []);
    expect(content).toEqual([]);
  });

  it("returns all blocks when multiple attachments", () => {
    const content = buildUserContent("msg", [
      { name: "a.png", type: "image/png", category: "image", base64: toBase64("a") },
      { name: "b.pdf", type: "application/pdf", category: "document", base64: toBase64("b") },
    ]);
    expect(content).toHaveLength(3);
    expect(content[0]).toEqual({ text: "msg" });
    expect(content[1]).toHaveProperty("image");
    expect(content[2]).toHaveProperty("document");
  });
});
