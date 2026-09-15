function createLogger(options = {}) {
  const stream = options.stream ?? process.stdout;
  const clock = options.clock ?? (() => new Date().toISOString());

  function write(level, event, details = {}) {
    stream.write(
      `${JSON.stringify({
        timestamp: clock(),
        level,
        event,
        ...details,
      })}\n`
    );
  }

  return {
    error(event, details) {
      write("error", event, details);
    },
    info(event, details) {
      write("info", event, details);
    },
  };
}

module.exports = { createLogger };
