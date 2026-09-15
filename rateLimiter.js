function createRateLimiter(options = {}) {
  const limit = options.limit ?? 10;
  const windowMs = options.windowMs ?? 60 * 60 * 1000;
  const maxEntries = options.maxEntries ?? 10000;
  const now = options.now ?? Date.now;
  const entries = new Map();

  function prune(currentTime) {
    for (const [key, entry] of entries) {
      if (currentTime - entry.windowStartedAt >= windowMs) {
        entries.delete(key);
      }
    }

    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  }

  function check(key) {
    const currentTime = now();
    let entry = entries.get(key);

    if (!entry || currentTime - entry.windowStartedAt >= windowMs) {
      entry = { count: 0, windowStartedAt: currentTime };
      entries.set(key, entry);
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((entry.windowStartedAt + windowMs - currentTime) / 1000)
        ),
      };
    }

    entry.count += 1;
    if (entries.size > maxEntries) prune(currentTime);
    return { allowed: true, remaining: limit - entry.count };
  }

  return { check };
}

module.exports = { createRateLimiter };
