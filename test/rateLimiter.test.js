const test = require("node:test");
const assert = require("node:assert/strict");

const { createRateLimiter } = require("../rateLimiter");

test("limits each user independently within a time window", () => {
  let time = 1000;
  const limiter = createRateLimiter({
    limit: 2,
    windowMs: 60000,
    now: () => time,
  });

  assert.equal(limiter.check("user-a").allowed, true);
  assert.equal(limiter.check("user-a").allowed, true);
  assert.equal(limiter.check("user-a").allowed, false);
  assert.equal(limiter.check("user-b").allowed, true);

  time += 60000;
  assert.equal(limiter.check("user-a").allowed, true);
});
