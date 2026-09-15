const test = require("node:test");
const assert = require("node:assert/strict");

const { buildStatusImageMessage } = require("../statusIndicator");

test("creates HTTPS image messages for each verdict", () => {
  const message = buildStatusImageMessage(
    "verified_official",
    "https://cyberguard.sbycom.com"
  );

  assert.deepEqual(message, {
    type: "image",
    originalContentUrl: "https://cyberguard.sbycom.com/assets/status/safe.png",
    previewImageUrl:
      "https://cyberguard.sbycom.com/assets/status/safe-preview.jpg",
  });
  assert.match(
    buildStatusImageMessage("caution", "https://cyberguard.sbycom.com").originalContentUrl,
    /not-sure\.png$/
  );
  assert.match(
    buildStatusImageMessage("likely_safe", "https://cyberguard.sbycom.com")
      .originalContentUrl,
    /likely-safe\.png$/
  );
  assert.match(
    buildStatusImageMessage("danger", "https://cyberguard.sbycom.com").originalContentUrl,
    /not-safe\.png$/
  );
});

test("does not create an image message without HTTPS", () => {
  assert.equal(buildStatusImageMessage("danger", "http://localhost:3000"), null);
  assert.equal(buildStatusImageMessage("unknown", "https://example.com"), null);
});
