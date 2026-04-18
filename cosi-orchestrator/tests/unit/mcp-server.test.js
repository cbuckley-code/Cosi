import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/registry.js", () => ({
  getAllTools: vi.fn(() => []),
  callTool: vi.fn(),
}));

const { getAllTools, callTool } = await import("../../src/registry.js");
const { buildMcpServer } = await import("../../src/mcp-server.js");

describe("buildMcpServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllTools.mockReturnValue([]);
  });

  it("returns an object (McpServer instance)", () => {
    const server = buildMcpServer();
    expect(server).toBeDefined();
    expect(typeof server).toBe("object");
  });

  it("does not throw when no tools are registered", () => {
    getAllTools.mockReturnValue([]);
    expect(() => buildMcpServer()).not.toThrow();
  });

  it("calls getAllTools() to get the tool list", () => {
    buildMcpServer();
    expect(getAllTools).toHaveBeenCalledOnce();
  });

  it("calls getAllTools() once per buildMcpServer() call", () => {
    buildMcpServer();
    buildMcpServer();
    expect(getAllTools).toHaveBeenCalledTimes(2);
  });

  it("returns a server with a tool() method", () => {
    const server = buildMcpServer();
    expect(typeof server.tool).toBe("function");
  });

  it("returns a server with setToolRequestHandlers method", () => {
    const server = buildMcpServer();
    expect(typeof server.setToolRequestHandlers).toBe("function");
  });

  it("with one tool: does not throw registering it", () => {
    getAllTools.mockReturnValue([
      {
        qualifiedName: "my-service__do_thing",
        description: "Does a thing",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "A message" },
          },
          required: ["message"],
        },
      },
    ]);
    expect(() => buildMcpServer()).not.toThrow();
  });

  it("with multiple tools: does not throw registering them", () => {
    getAllTools.mockReturnValue([
      {
        qualifiedName: "svc__tool_a",
        description: "Tool A",
        inputSchema: { type: "object", properties: {} },
      },
      {
        qualifiedName: "svc__tool_b",
        description: "Tool B",
        inputSchema: {
          type: "object",
          properties: { count: { type: "number" } },
        },
      },
    ]);
    expect(() => buildMcpServer()).not.toThrow();
  });

  it("with a tool that has no description: falls back to qualifiedName label", () => {
    getAllTools.mockReturnValue([
      {
        qualifiedName: "svc__my_tool",
        description: null,
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    // Just verifying no exception is thrown with null description
    expect(() => buildMcpServer()).not.toThrow();
  });

  it("handles tools with boolean properties in inputSchema", () => {
    getAllTools.mockReturnValue([
      {
        qualifiedName: "svc__toggle",
        description: "Toggle something",
        inputSchema: {
          type: "object",
          properties: { enabled: { type: "boolean" } },
          required: ["enabled"],
        },
      },
    ]);
    expect(() => buildMcpServer()).not.toThrow();
  });

  it("handles tools with array properties in inputSchema", () => {
    getAllTools.mockReturnValue([
      {
        qualifiedName: "svc__batch",
        description: "Batch operation",
        inputSchema: {
          type: "object",
          properties: { items: { type: "array" } },
        },
      },
    ]);
    expect(() => buildMcpServer()).not.toThrow();
  });

  it("handles tools with object properties in inputSchema", () => {
    getAllTools.mockReturnValue([
      {
        qualifiedName: "svc__nested",
        description: "Nested object",
        inputSchema: {
          type: "object",
          properties: { config: { type: "object" } },
          required: ["config"],
        },
      },
    ]);
    expect(() => buildMcpServer()).not.toThrow();
  });

  it("handles tools with integer type in inputSchema", () => {
    getAllTools.mockReturnValue([
      {
        qualifiedName: "svc__counter",
        description: "Counter tool",
        inputSchema: {
          type: "object",
          properties: { count: { type: "integer" } },
        },
      },
    ]);
    expect(() => buildMcpServer()).not.toThrow();
  });

  it("handles tools with null or missing inputSchema", () => {
    getAllTools.mockReturnValue([
      {
        qualifiedName: "svc__simple",
        description: "Simple tool",
        inputSchema: null,
      },
    ]);
    expect(() => buildMcpServer()).not.toThrow();
  });

  it("handles tools with inputSchema missing properties", () => {
    getAllTools.mockReturnValue([
      {
        qualifiedName: "svc__empty",
        description: "Empty schema tool",
        inputSchema: { type: "object" },
      },
    ]);
    expect(() => buildMcpServer()).not.toThrow();
  });
});
