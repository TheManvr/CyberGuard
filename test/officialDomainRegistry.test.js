const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findOfficialDomain,
  officialDomains,
  validateRegistry,
} = require("../officialDomainRegistry");

test("loads a valid registry with unique verified domains", () => {
  assert.doesNotThrow(() => validateRegistry(officialDomains));
  assert.ok(officialDomains.length >= 40);
});

test("matches an exact official domain and an allowed subdomain", () => {
  assert.equal(findOfficialDomain("https://google.com/").organization, "Google");
  assert.equal(
    findOfficialDomain("https://maps.google.com/").organization,
    "Google"
  );
  assert.equal(
    findOfficialDomain("https://vt.tiktok.com/example/").organization,
    "TikTok"
  );
  assert.equal(
    findOfficialDomain("https://seller.shopee.co.th/").organization,
    "Shopee Thailand"
  );
  assert.equal(
    findOfficialDomain("https://www.scb.co.th/th/home/").organization,
    "ธนาคารไทยพาณิชย์"
  );
});

test("does not trust a lookalike or domain used as a path", () => {
  assert.equal(findOfficialDomain("https://google.com.fake.example/"), null);
  assert.equal(findOfficialDomain("https://fake.example/google.com"), null);
  assert.equal(findOfficialDomain("https://g00gle.com/"), null);
  assert.equal(findOfficialDomain("https://shopee.co.th.fake.example/"), null);
  assert.equal(findOfficialDomain("https://scb.co.th.fake.example/"), null);
});

test("requires HTTPS before returning a verified match", () => {
  assert.equal(findOfficialDomain("http://google.com/"), null);
});
