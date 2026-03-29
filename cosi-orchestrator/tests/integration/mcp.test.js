import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

let app;

beforeAll(async () => {
  app = await createApp();
});

describe("POST /mcp", () => {
  it("responds to MCP initialize request", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      })
      .parse((res, callback) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200);
  });
});
