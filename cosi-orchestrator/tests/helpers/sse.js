/**
 * Parse raw SSE text into an array of event objects.
 *
 * Each SSE block looks like:
 *   data: {"type":"chunk","text":"Hello"}\n\n
 *
 * Usage with supertest:
 *   const res = await request(app).post('/api/...').send({...})
 *   const events = parseSSEEvents(res.text)
 *
 * superagent (used by supertest) automatically buffers text/* responses
 * into res.text — no custom parser needed for text/event-stream.
 */
export function parseSSEEvents(raw) {
  if (!raw) return [];
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
