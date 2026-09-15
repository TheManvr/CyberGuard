const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCyberGuardReply,
  formatAiClassification,
} = require("../messageAnalyzer");

test("keeps the basic analyzer when AI is disabled", async () => {
  const reply = await createCyberGuardReply("https://example.com", {
    aiEnabled: false,
    redirectResolver: async () => ({
      finalUrl: "https://example.com/",
      redirects: 0,
      chain: [{ url: "https://example.com/", status: 200 }],
    }),
  });

  assert.match(reply, /ยังไม่พบสิ่งผิดปกติจากลิงก์/);
  assert.doesNotMatch(reply, /ผลตรวจเว็บไซต์/);
});

test("combines redirect checks with an AI website classification", async () => {
  const reply = await createCyberGuardReply("https://short.example/go", {
    aiEnabled: true,
    openaiApiKey: "test-key",
    contentFetcher: async () => ({
      finalUrl: "https://fake-bank.example/login",
      redirects: 1,
      chain: [
        { url: "https://short.example/go", status: 302 },
        { url: "https://fake-bank.example/login", status: 200 },
      ],
      content: {
        title: "ยืนยันบัญชี",
        description: "",
        text: "กรุณากรอกรหัสผ่านและ OTP ".repeat(20),
        truncated: false,
      },
    }),
    classifier: async () => ({
      category: "phishing",
      riskLevel: "high",
      confidence: 0.92,
      summaryThai: "พยายามขอข้อมูลสำคัญ",
      evidenceThai: ["ขอรหัสผ่านและ OTP"],
      recommendedAction: "avoid_and_verify",
    }),
  });

  assert.match(reply, /อาจเป็นเว็บหลอกเอาข้อมูล/);
  assert.match(reply, /อย่ากรอกรหัสผ่านหรือรหัส OTP/);
  assert.match(reply, /📌 สรุป/);
  assert.match(reply, /🔎 เหตุผล/);
  assert.match(reply, /✅ ควรทำตอนนี้/);
  assert.doesNotMatch(reply, /ความมั่นใจ/);
});

test("does not describe a low-risk AI result as guaranteed safe", () => {
  const output = formatAiClassification({
    category: "legitimate",
    riskLevel: "low",
    confidence: 0.8,
    summaryThai: "ยังไม่พบเนื้อหาเข้าข่าย",
    evidenceThai: [],
    recommendedAction: "no_action",
  });

  assert.match(output, /ไม่รับรองความปลอดภัย 100%/);
  assert.doesNotMatch(output, /ปลอดภัยแน่นอน/);
});

test("identifies the main Google website without guaranteeing safety", () => {
  const output = formatAiClassification(
    {
      category: "legitimate",
      riskLevel: "low",
      confidence: 0.9,
      summaryThai: "ยังไม่พบข้อความหลอกลวง",
      evidenceThai: [],
      recommendedAction: "no_action",
    },
    { finalUrl: "https://www.google.com/search" }
  );

  assert.match(output, /ชื่อเว็บทางการของ Google/);
  assert.match(output, /บริการค้นหาข้อมูลของ Google/);
  assert.match(output, /ไม่รับรองความปลอดภัย 100%/);
});

test("warns clearly when a dynamic website has too little readable content", async () => {
  const reply = await createCyberGuardReply("https://game.example", {
    aiEnabled: true,
    contentFetcher: async () => ({
      finalUrl: "https://game.example/",
      redirects: 0,
      content: {
        title: "Game 68",
        text: "Game 68 Copyright",
        limitedContent: true,
      },
    }),
    classifier: async () => {
      throw new Error("The classifier must not run without enough evidence");
    },
  });

  assert.match(reply, /ยังยืนยันไม่ได้ว่าเว็บนี้ปลอดภัย/);
  assert.match(reply, /แสดงข้อมูลหลังจากเปิดในเบราว์เซอร์/);
  assert.match(reply, /อย่าเพิ่งสมัครสมาชิกหรือเติมเงิน/);
});

test("offers a safe preview image when the checked page supplies one", async () => {
  let preview;
  await createCyberGuardReply("https://example.com", {
    aiEnabled: true,
    contentFetcher: async () => ({
      finalUrl: "https://example.com/",
      redirects: 0,
      content: {
        title: "ตัวอย่าง",
        text: "ข้อมูลสำหรับการทดสอบ ".repeat(20),
        previewImageUrl: "https://example.com/preview.jpg",
      },
    }),
    classifier: async () => ({
      category: "legitimate",
      riskLevel: "low",
      confidence: 0.8,
      summaryThai: "ยังไม่พบข้อความหลอกลวง",
      evidenceThai: [],
      recommendedAction: "no_action",
    }),
    onPreview: (value) => {
      preview = value;
    },
  });

  assert.deepEqual(preview, {
    imageUrl: "https://example.com/preview.jpg",
    title: "ตัวอย่าง",
  });
});

test("uses a preview image when a dynamic page has little text", async () => {
  let classifiedContent;
  const reply = await createCyberGuardReply("https://game.example", {
    aiEnabled: true,
    contentFetcher: async () => ({
      finalUrl: "https://game.example/",
      redirects: 0,
      content: {
        title: "Game 68",
        text: "Game 68 Copyright",
        limitedContent: true,
        previewImageUrl: "https://game.example/preview.jpg",
      },
    }),
    classifier: async (content) => {
      classifiedContent = content;
      return {
        category: "gambling",
        riskLevel: "high",
        confidence: 0.9,
        summaryThai: "ภาพมีเกมพนันและปุ่มเติมเงิน",
        evidenceThai: ["พบคำว่าเติมเงินในภาพ"],
        recommendedAction: "block",
      };
    },
  });

  assert.equal(
    classifiedContent.previewImageUrl,
    "https://game.example/preview.jpg"
  );
  assert.match(reply, /ควรหลีกเลี่ยงเว็บนี้/);
  assert.match(reply, /ใช้ภาพตัวอย่างของเว็บไซต์ช่วยตรวจ/);
  assert.match(reply, /อ่านข้อความได้ไม่ครบ/);
});
