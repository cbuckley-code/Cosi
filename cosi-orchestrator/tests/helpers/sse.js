/**
 * Parse raw SSE text into an array of event objects.
 *
 * Each SSE block looks like:
 *   data: {"type":"chunk","text":"Hello"}\n\n
 */
export function parseSSEEvents(raw) {
  return raw
    .split("\n\n")
    .map((block) => {
      const dataLine = block
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!dataLine) return null;
      try {
        return JSON.parse(dataLine.slice(6));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * supertest custom response parser for SSE streams.
 * Use with: request(app).post(...).parse(sseParser)
 * Result is in res.body as a string.
 */
export function sseParser(res, callback) {
  let data = "";
  res.setEncoding("utf8");
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => callback(null, data));
}
