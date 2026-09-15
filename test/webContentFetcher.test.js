const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractReadableContent,
  fetchWebContent,
  selectRelevantText,
} = require("../webContentFetcher");

const PUBLIC_ADDRESS = [{ address: "93.184.216.34", family: 4 }];

test("extracts visible text and removes active or hidden content", () => {
  const result = extractReadableContent(`
    <html>
      <head>
        <title>ธนาคารตัวอย่าง</title>
        <meta name="description" content="ยืนยันบัญชีของคุณ">
        <style>.hidden { display: none }</style>
        <script>ignoreThisInstruction()</script>
      </head>
      <body><h1>กรุณากรอกรหัสผ่าน</h1></body>
    </html>
  `);

  assert.equal(result.title, "ธนาคารตัวอย่าง");
  assert.match(result.text, /กรุณากรอกรหัสผ่าน/);
  assert.doesNotMatch(result.text, /ignoreThisInstruction/);
});

test("uses safe Open Graph metadata when a dynamic page has little body text", () => {
  const result = extractReadableContent(
    `
      <html>
        <head>
          <meta property="og:title" content="เว็บตัวอย่าง">
          <meta property="og:description" content="ข้อมูลจากหน้าเว็บ">
          <meta property="og:image" content="/preview.jpg">
          <script src="/app.js"></script>
        </head>
        <body><div id="app"></div></body>
      </html>
    `,
    12000,
    new URL("https://example.com/start")
  );

  assert.equal(result.title, "เว็บตัวอย่าง");
  assert.equal(result.description, "ข้อมูลจากหน้าเว็บ");
  assert.equal(result.previewImageUrl, "https://example.com/preview.jpg");
  assert.equal(result.limitedContent, true);
});

test("does not use a preview image from another host", () => {
  const result = extractReadableContent(
    '<meta property="og:image" content="https://images.example.net/preview.jpg">',
    12000,
    new URL("https://example.com")
  );

  assert.equal(result.previewImageUrl, null);
});

test("follows redirects and returns content from the final public page", async () => {
  const responses = new Map([
    [
      "https://short.example/start",
      { status: 302, location: "https://final.example/login", body: null },
    ],
    [
      "https://final.example/login",
      {
        status: 200,
        location: null,
        body: "<html><title>เข้าสู่ระบบ</title><body>ยืนยันรหัสผ่าน</body></html>",
      },
    ],
  ]);

  const result = await fetchWebContent("https://short.example/start", {
    resolveAddresses: async () => PUBLIC_ADDRESS,
    requestPage: async (url) => responses.get(url.href),
  });

  assert.equal(result.finalUrl, "https://final.example/login");
  assert.equal(result.redirects, 1);
  assert.match(result.content.text, /ยืนยันรหัสผ่าน/);
});

test("blocks a private redirect destination before fetching it", async () => {
  let requestCount = 0;

  await assert.rejects(
    fetchWebContent("https://short.example/start", {
      resolveAddresses: async (hostname) =>
        hostname === "short.example"
          ? PUBLIC_ADDRESS
          : [{ address: "127.0.0.1", family: 4 }],
      requestPage: async () => {
        requestCount += 1;
        return {
          status: 302,
          location: "http://internal.example/admin",
          body: null,
        };
      },
    }),
    { code: "BLOCKED_ADDRESS" }
  );

  assert.equal(requestCount, 1);
});

test("limits text sent onward for analysis", () => {
  const result = extractReadableContent(
    `<html><body>${"ข้อความ ".repeat(100)}</body></html>`,
    50
  );

  assert.equal(result.text.length, 50);
  assert.equal(result.truncated, true);
});

test("keeps high-signal text from the middle of a long page", () => {
  const body = [
    "ข่าวทั่วไป ".repeat(500),
    "สมัครสมาชิกคาสิโน รับโบนัสและฝากเงินได้ทันที ".repeat(10),
    "บทความทั่วไป ".repeat(500),
  ].join(" ");
  const result = selectRelevantText("เว็บข่าว", "ข่าวประจำวัน", body, 1400);

  assert.ok(result.length <= 1400);
  assert.match(result, /คาสิโน/);
  assert.match(result, /ฝากเงิน/);
});
