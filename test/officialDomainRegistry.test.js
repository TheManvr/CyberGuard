const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findOfficialDomain,
  officialDomains,
  validateRegistry,
} = require("../officialDomainRegistry");

test("loads a valid registry with unique verified domains", () => {
  assert.doesNotThrow(() => validateRegistry(officialDomains));
  assert.ok(officialDomains.length >= 10);
});

test("matches an exact official domain and an allowed subdomain", () => {
  assert.equal(findOfficialDomain("https://google.com/").organization, "Google");
  assert.equal(
    findOfficialDomain("https://maps.google.com/").organization,
    "Google"
  );
});

test("does not trust a lookalike or domain used as a path", () => {
  assert.equal(findOfficialDomain("https://google.com.fake.example/"), null);
  assert.equal(findOfficialDomain("https://fake.example/google.com"), null);
  assert.equal(findOfficialDomain("https://g00gle.com/"), null);
});

test("requires HTTPS before returning a verified match", () => {
  assert.equal(findOfficialDomain("http://google.com/"), null);
});
