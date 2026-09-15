const test = require("node:test");
const assert = require("node:assert/strict");

const {
  analyzeUrl,
  createReplyText,
  createReplyTextWithRedirects,
  extractUrls,
} = require("../linkAnalyzer");

test("extracts links without treating email addresses as links", () => {
  const links = extractUrls(
    "ติดต่อ help@example.com หรือเปิด https://example.com/help"
  );

  assert.deepEqual(links, ["https://example.com/help"]);
});

test("warns about unencrypted IP address links", () => {
  const result = analyzeUrl("http://192.168.1.10/login");

  assert.ok(result.warnings.includes("ไม่ได้เข้ารหัสด้วย HTTPS"));
  assert.ok(result.warnings.includes("ใช้หมายเลข IP แทนชื่อเว็บไซต์"));
});

test("warns about shortened links", () => {
  const result = analyzeUrl("https://bit.ly/example");

  assert.ok(
    result.warnings.includes("เป็นลิงก์ย่อ จึงยังมองไม่เห็นปลายทางจริง")
  );
});

test("warns about redirect-like links on an unknown domain", () => {
  const result = analyzeUrl("https://s.thbyz.com/s/5pf783");

  assert.ok(
    result.warnings.includes(
      "โครงสร้างคล้ายลิงก์ย่อหรือเปลี่ยนเส้นทางไปเว็บอื่น"
    )
  );
});

test("does not claim that a normal link is safe", () => {
  const reply = createReplyText("https://example.com/about");

  assert.match(reply, /ยังไม่พบสิ่งผิดปกติจากลิงก์/);
  assert.match(reply, /อย่าเพิ่งกรอกรหัสผ่าน/);
  assert.doesNotMatch(reply, /ปลอดภัยแน่นอน/);
});

test("keeps the original acknowledgement for messages without links", () => {
  const reply = createReplyText("สวัสดีครับ");

  assert.match(reply, /Cyber-Guard Bot ได้รับข้อความแล้ว/);
  assert.match(reply, /ยังไม่พบลิงก์/);
});

test("shows the final hostname after a redirect", async () => {
  const reply = await createReplyTextWithRedirects(
    "https://bit.ly/example",
    async () => ({
      finalUrl: "https://fake-bank.example/login",
      redirects: 1,
      chain: [
        { url: "https://bit.ly/example", status: 302 },
        { url: "https://fake-bank.example/login", status: 200 },
      ],
    })
  );

  assert.match(reply, /ลิงก์นี้พาไปเว็บไซต์อื่น 1 ครั้ง/);
  assert.match(reply, /เว็บไซต์ที่ลิงก์พาไปคือ: fake-bank\.example/);
  assert.match(reply, /ปลายทาง: มีคำที่มักใช้/);
});

test("treats redirect resolution failures as caution, not safety", async () => {
  const reply = await createReplyTextWithRedirects(
    "https://example.com",
    async () => {
      const error = new Error("timeout");
      error.code = "TIMEOUT";
      throw error;
    }
  );

  assert.match(reply, /ควรระวังก่อนเปิดเว็บนี้/);
  assert.match(reply, /เว็บไซต์ตอบช้าเกินไป/);
  assert.doesNotMatch(reply, /ยังไม่พบสิ่งผิดปกติจากลิงก์/);
});
