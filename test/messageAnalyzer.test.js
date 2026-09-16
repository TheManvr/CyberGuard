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

test("uses the likely-safe status only for a low-risk AI result", async () => {
  let status;
  await createCyberGuardReply("https://example.com", {
    aiEnabled: true,
    contentFetcher: async () => ({
      finalUrl: "https://example.com/",
      content: { text: "ข้อมูลทั่วไปของเว็บไซต์ ".repeat(20) },
    }),
    classifier: async () => ({
      category: "legitimate",
      riskLevel: "low",
      confidence: 0.8,
      summaryThai: "ยังไม่พบข้อความหลอกลวง",
      evidenceThai: [],
      recommendedAction: "no_action",
    }),
    onStatus: (value) => {
      status = value.status;
    },
  });

  assert.equal(status, "likely_safe");
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

test("explains a domain registration group without treating it as proof of safety", () => {
  const output = formatAiClassification(
    {
      category: "legitimate",
      riskLevel: "low",
      confidence: 0.8,
      summaryThai: "ยังไม่พบข้อความหลอกลวง",
      evidenceThai: [],
      recommendedAction: "no_action",
    },
    {
      domainSignal: {
        descriptionThai: "ชื่อเว็บอยู่ในกลุ่มหน่วยงานรัฐไทย",
        limitationThai: "ส่วนท้ายของชื่อเว็บเพียงอย่างเดียว ยังไม่รับรองว่าทุกหน้าปลอดภัย",
      },
    }
  );

  assert.match(output, /กลุ่มชื่อเว็บ/);
  assert.match(output, /ยังไม่รับรองว่าทุกหน้า/);
  assert.doesNotMatch(output, /ปลอดภัยแน่นอน/);
});

test("identifies the main Google website without guaranteeing every page", () => {
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

  assert.match(output, /โดเมนทางการของ Google/);
  assert.match(output, /บริการค้นหาข้อมูล.*Google/);
  assert.match(output, /ไม่รับรองความปลอดภัย 100%/);
});

test("uses the verified registry for an official domain without calling AI", async () => {
  let classifierCalled = false;
  let status;
  const reply = await createCyberGuardReply("https://maps.google.com/", {
    aiEnabled: true,
    reputationCheckEnabled: true,
    contentFetcher: async () => ({
      finalUrl: "https://maps.google.com/",
      redirects: 0,
      content: { text: "Google Maps" },
    }),
    reputationChecker: async () => ({
      status: "not_found",
      providers: ["OpenPhish"],
      threats: [],
    }),
    classifier: async () => {
      classifierCalled = true;
      throw new Error("Official domains should not spend AI credits");
    },
    onStatus: (value) => {
      status = value.status;
    },
  });

  assert.equal(classifierCalled, false);
  assert.equal(status, "verified_official");
  assert.match(reply, /เป็นโดเมนทางการที่ยืนยันแล้ว/);
  assert.match(reply, /เจ้าของเว็บไซต์: Google/);
  assert.match(reply, /ไม่พบรายงานจาก OpenPhish/);
  assert.match(reply, /ไม่รับรองทุกหน้าและทุกเนื้อหาว่าปลอดภัย 100%/);
});

test("does not trust a lookalike domain", async () => {
  const reply = await createCyberGuardReply("https://google.com.fake.example/", {
    aiEnabled: true,
    contentFetcher: async () => ({
      finalUrl: "https://google.com.fake.example/",
      content: { text: "เว็บไซต์ทั่วไป ".repeat(20) },
    }),
    classifier: async () => ({
      category: "suspicious",
      riskLevel: "medium",
      confidence: 0.8,
      summaryThai: "ชื่อเว็บไซต์อาจทำให้เข้าใจผิด",
      evidenceThai: [],
      recommendedAction: "use_caution",
    }),
  });

  assert.doesNotMatch(reply, /เป็นโดเมนทางการที่ยืนยันแล้ว/);
  assert.match(reply, /ควรระวังเว็บนี้/);
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
  let status;
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
    onStatus: (value) => {
      status = value.status;
    },
  });

  assert.equal(
    classifiedContent.previewImageUrl,
    "https://game.example/preview.jpg"
  );
  assert.match(reply, /ควรหลีกเลี่ยงเว็บนี้/);
  assert.match(reply, /ใช้ภาพตัวอย่างของเว็บไซต์ช่วยตรวจ/);
  assert.match(reply, /อ่านข้อความได้ไม่ครบ/);
  assert.equal(status, "danger");
});

test("uses a separate browser renderer when the first page has little text", async () => {
  let classifiedContent;
  const reply = await createCyberGuardReply("https://dynamic.example", {
    aiEnabled: true,
    dynamicAnalysisEnabled: true,
    contentFetcher: async () => ({
      finalUrl: "https://dynamic.example/",
      content: { title: "Loading", text: "Loading", limitedContent: true },
    }),
    dynamicContentFetcher: async () => ({
      finalUrl: "https://dynamic.example/",
      content: {
        title: "คาสิโน",
        text: "สมัครสมาชิก รับโบนัส ฝากเงิน เล่นสล็อต ".repeat(10),
        analysisImageUrl: "data:image/jpeg;base64,dGVzdA==",
        renderedWithBrowser: true,
      },
    }),
    classifier: async (content) => {
      classifiedContent = content;
      return {
        category: "gambling",
        riskLevel: "high",
        confidence: 0.95,
        summaryThai: "พบเว็บพนัน",
        evidenceThai: ["มีการฝากเงินและเล่นสล็อต"],
        recommendedAction: "block",
      };
    },
  });

  assert.equal(classifiedContent.renderedWithBrowser, true);
  assert.match(reply, /เปิดหน้าเว็บแบบจำลอง/);
  assert.match(reply, /ควรหลีกเลี่ยงเว็บนี้/);
});

test("a dangerous reputation match overrides a low-risk AI verdict", async () => {
  const reply = await createCyberGuardReply("https://reported.example", {
    aiEnabled: true,
    reputationCheckEnabled: true,
    contentFetcher: async () => ({
      finalUrl: "https://reported.example/",
      content: { text: "หน้าเว็บไซต์ทั่วไป ".repeat(20) },
    }),
    reputationChecker: async () => ({
      status: "dangerous",
      providers: ["Google Safe Browsing"],
      threats: ["SOCIAL_ENGINEERING"],
    }),
    classifier: async () => ({
      category: "legitimate",
      riskLevel: "low",
      confidence: 0.7,
      summaryThai: "ข้อความในหน้าเว็บดูปกติ",
      evidenceThai: [],
      recommendedAction: "no_action",
    }),
  });

  assert.match(reply, /ฐานข้อมูลแจ้งว่าเว็บนี้อันตราย/);
  assert.match(reply, /อย่าเปิดเว็บนี้ต่อ/);
  assert.doesNotMatch(reply, /เปิดดูข้อมูลทั่วไปได้/);
});

test("a danger report overrides an official-domain registry match", async () => {
  const reply = await createCyberGuardReply("https://google.com/bad-page", {
    aiEnabled: true,
    reputationCheckEnabled: true,
    contentFetcher: async () => ({
      finalUrl: "https://google.com/bad-page",
      content: { text: "หน้าเว็บไซต์ทั่วไป ".repeat(20) },
    }),
    reputationChecker: async () => ({
      status: "dangerous",
      providers: ["Google Safe Browsing"],
      threats: ["SOCIAL_ENGINEERING"],
    }),
    classifier: async () => ({
      category: "legitimate",
      riskLevel: "low",
      confidence: 0.7,
      summaryThai: "ข้อความในหน้าเว็บดูปกติ",
      evidenceThai: [],
      recommendedAction: "no_action",
    }),
  });

  assert.match(reply, /ฐานข้อมูลแจ้งว่าเว็บนี้อันตราย/);
  assert.doesNotMatch(reply, /เป็นโดเมนทางการที่ยืนยันแล้ว/);
});

test("adds web research as supporting evidence", async () => {
  let classifiedContent;
  const reply = await createCyberGuardReply("https://shop.example", {
    aiEnabled: true,
    webResearchEnabled: true,
    webResearchMode: "always",
    contentFetcher: async () => ({
      finalUrl: "https://shop.example/",
      content: { text: "ร้านค้าทั่วไป ".repeat(20) },
    }),
    webResearcher: async () => ({
      summary: "พบคำเตือนจากหน่วยงานหนึ่ง",
    }),
    classifier: async (content) => {
      classifiedContent = content;
      return {
        category: "suspicious",
        riskLevel: "medium",
        confidence: 0.8,
        summaryThai: "ควรตรวจสอบร้านค้าก่อนจ่ายเงิน",
        evidenceThai: [],
        recommendedAction: "use_caution",
      };
    },
  });

  assert.match(classifiedContent.externalResearch, /คำเตือน/);
  assert.match(reply, /ค้นข้อมูลเพิ่มเติม/);
});
