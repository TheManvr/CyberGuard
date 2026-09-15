const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isBlockedAddress,
  normalizeUrl,
  resolveRedirectChain,
} = require("../redirectResolver");

const PUBLIC_ADDRESS = [{ address: "93.184.216.34", family: 4 }];

test("blocks private and special-use addresses", () => {
  assert.equal(isBlockedAddress("127.0.0.1", 4), true);
  assert.equal(isBlockedAddress("10.0.0.1", 4), true);
  assert.equal(isBlockedAddress("169.254.169.254", 4), true);
  assert.equal(isBlockedAddress("::1", 6), true);
  assert.equal(isBlockedAddress("fd00::1", 6), true);
  assert.equal(isBlockedAddress("::ffff:127.0.0.1", 6), true);
});

test("allows public IPv4 and IPv6 addresses", () => {
  assert.equal(isBlockedAddress("8.8.8.8", 4), false);
  assert.equal(isBlockedAddress("2606:4700:4700::1111", 6), false);
});

test("rejects credentials, unsupported protocols, and non-standard ports", () => {
  assert.throws(() => normalizeUrl("ftp://example.com/file"), {
    code: "UNSUPPORTED_PROTOCOL",
  });
  assert.throws(() => normalizeUrl("https://user:pass@example.com"), {
    code: "URL_CREDENTIALS",
  });
  assert.throws(() => normalizeUrl("https://example.com:8080"), {
    code: "BLOCKED_PORT",
  });
});

test("follows redirects manually and reports the final URL", async () => {
  const responses = new Map([
    [
      "https://short.example/start",
      { status: 302, location: "https://final.example/login" },
    ],
    ["https://final.example/login", { status: 200, location: null }],
  ]);

  const result = await resolveRedirectChain("https://short.example/start", {
    resolveAddresses: async () => PUBLIC_ADDRESS,
    requestHeaders: async (url) => responses.get(url.href),
  });

  assert.equal(result.finalUrl, "https://final.example/login");
  assert.equal(result.redirects, 1);
  assert.deepEqual(
    result.chain.map((hop) => hop.status),
    [302, 200]
  );
});

test("checks and blocks a private destination before following it", async () => {
  let requestCount = 0;

  await assert.rejects(
    resolveRedirectChain("https://short.example/start", {
      resolveAddresses: async (hostname) =>
        hostname === "short.example"
          ? PUBLIC_ADDRESS
          : [{ address: "127.0.0.1", family: 4 }],
      requestHeaders: async () => {
        requestCount += 1;
        return { status: 302, location: "http://internal.example/admin" };
      },
    }),
    { code: "BLOCKED_ADDRESS" }
  );

  assert.equal(requestCount, 1);
});

test("stops redirect loops", async () => {
  await assert.rejects(
    resolveRedirectChain("https://loop.example/a", {
      resolveAddresses: async () => PUBLIC_ADDRESS,
      requestHeaders: async (url) => ({
        status: 302,
        location:
          url.pathname === "/a"
            ? "https://loop.example/b"
            : "https://loop.example/a",
      }),
    }),
    { code: "REDIRECT_LOOP" }
  );
});
