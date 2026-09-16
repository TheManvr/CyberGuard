const test = require("node:test");
const assert = require("node:assert/strict");

const { detectDomainRegistrationSignal } = require("../domainTrustSignals");

test("identifies Thai government and academic registration groups", () => {
  const government = detectDomainRegistrationSignal("https://service.go.th/login");
  const academic = detectDomainRegistrationSignal("https://library.ac.th");

  assert.equal(government.suffix, ".go.th");
  assert.match(government.descriptionThai, /หน่วยงานรัฐไทย/);
  assert.equal(academic.suffix, ".ac.th");
  assert.match(academic.limitationThai, /ยังไม่รับรอง/);
});

test("identifies Thai business and US education registration groups", () => {
  assert.equal(
    detectDomainRegistrationSignal("https://company.co.th").suffix,
    ".co.th"
  );
  assert.equal(
    detectDomainRegistrationSignal("https://university.edu/about").suffix,
    ".edu"
  );
});

test("does not trust a lookalike that only contains a trusted suffix", () => {
  assert.equal(
    detectDomainRegistrationSignal("https://go.th.example.com"),
    null
  );
});
