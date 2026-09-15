const test = require("node:test");
const assert = require("node:assert/strict");

const {
  checkGoogleSafeBrowsing,
  checkOpenPhish,
  checkPhishTank,
  checkUrlReputation,
} = require("../reputationChecker");

function jsonResponse(value) {
  return {
    ok: true,
    text: async () => JSON.stringify(value),
  };
}

test("Google Safe Browsing reports matched threats", async () => {
  const result = await checkGoogleSafeBrowsing(["https://bad.example"], {
    apiKey: "test-key",
    fetchImpl: async () =>
      jsonResponse({ threats: [{ threatTypes: ["SOCIAL_ENGINEERING"] }] }),
  });

  assert.equal(result.dangerous, true);
  assert.deepEqual(result.threats, ["SOCIAL_ENGINEERING"]);
});

test("PhishTank requires a verified and still-valid report", async () => {
  const result = await checkPhishTank("https://bad.example", {
    enabled: true,
    fetchImpl: async () =>
      jsonResponse({
        results: { in_database: true, verified: "y", valid: "y" },
      }),
  });

  assert.equal(result.dangerous, true);
});

test("OpenPhish compares URLs from the downloaded community feed", async () => {
  const result = await checkOpenPhish(
    ["https://bad.example/login", "https://normal.example"],
    {
      enabled: true,
      fetchImpl: async () => ({
        ok: true,
        text: async () => "https://bad.example/login\nhttps://other.example/",
      }),
    }
  );

  assert.equal(result.dangerous, true);
  assert.deepEqual(result.threats, ["PHISHING"]);
});

test("reputation aggregation survives a failed provider", async () => {
  let call = 0;
  const result = await checkUrlReputation(["https://example.com"], {
    googleApiKey: "test-key",
    phishTankEnabled: true,
    fetchImpl: async () => {
      call += 1;
      if (call === 1) throw new Error("provider unavailable");
      return jsonResponse({ results: { in_database: false } });
    },
  });

  assert.equal(result.status, "not_found");
  assert.equal(result.errors, 1);
  assert.deepEqual(result.providers, ["PhishTank"]);
});
