const test = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");

const { createLogger } = require("../logger");

test("writes operational metadata as one JSON line", () => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = createLogger({
    stream,
    clock: () => "2026-09-15T00:00:00.000Z",
  });

  logger.info("ai_analysis", {
    status: "completed",
    category: "phishing",
    durationMs: 250,
  });

  assert.deepEqual(JSON.parse(output), {
    timestamp: "2026-09-15T00:00:00.000Z",
    level: "info",
    event: "ai_analysis",
    status: "completed",
    category: "phishing",
    durationMs: 250,
  });
});
