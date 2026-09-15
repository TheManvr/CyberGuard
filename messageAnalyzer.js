const { classifyWebsite } = require("./aiClassifier");
const {
  createReplyText,
  createReplyTextWithRedirects,
  extractUrls,
} = require("./linkAnalyzer");
const { resolveRedirectChain } = require("./redirectResolver");
const { fetchWebContent } = require("./webContentFetcher");

const KNOWN_WEBSITES = new Map([
  [
    "google.com",
    {
      name: "Google",
      purpose: "บริการค้นหาข้อมูลของ Google",
    },
  ],
]);

const SENIOR_VERDICTS = {
  gambling: {
    headline: "⛔ ควรหลีกเลี่ยงเว็บนี้",
    defaultReason: "พบเนื้อหาเกี่ยวกับการพนัน",
    actions: ["อย่าสมัครสมาชิก", "อย่าเติมเงินหรือโอนเงิน", "ปิดหน้าเว็บนี้"],
  },
  phishing: {
    headline: "⛔ อาจเป็นเว็บหลอกเอาข้อมูล",
    defaultReason: "พบข้อความที่อาจหลอกให้ส่งข้อมูลสำคัญ",
    actions: ["อย่ากรอกรหัสผ่านหรือรหัส OTP", "อย่าส่งข้อมูลบัตรหรือโอนเงิน", "ติดต่อหน่วยงานจากช่องทางทางการ"],
  },
  impersonation: {
    headline: "⚠️ อาจเป็นเว็บเลียนแบบ",
    defaultReason: "พบลักษณะที่อาจทำให้เข้าใจว่าเป็นองค์กรอื่น",
    actions: ["อย่ากรอกข้อมูลสำคัญ", "ตรวจชื่อเว็บกับช่องทางทางการ", "อย่าโอนเงินก่อนยืนยัน"],
  },
  financial_scam: {
    headline: "⛔ อาจเป็นเว็บหลอกเรื่องเงิน",
    defaultReason: "พบข้อความชวนลงทุน รับผลตอบแทน หรือโอนเงิน",
    actions: ["อย่าโอนเงิน", "อย่าส่งข้อมูลบัตรหรือรหัส OTP", "ปรึกษาคนใกล้ชิดหรือหน่วยงานที่เกี่ยวข้อง"],
  },
  suspicious: {
    headline: "⚠️ ควรระวังเว็บนี้",
    defaultReason: "พบข้อมูลที่ยังน่าเป็นห่วง",
    actions: ["อย่าให้ข้อมูลส่วนตัว", "อย่าโอนเงิน", "ตรวจสอบกับแหล่งทางการก่อน"],
  },
  legitimate: {
    headline: "🛡️ ยังไม่พบสัญญาณหลอกลวงจากข้อมูลที่อ่านได้",
    defaultReason: "ข้อมูลที่ระบบอ่านได้ยังไม่พบการหลอกให้เสียเงินหรือส่งข้อมูล",
    actions: ["เปิดดูข้อมูลทั่วไปได้", "ก่อนกรอกรหัสหรือข้อมูลบัตร ให้ตรวจชื่อเว็บอีกครั้ง"],
  },
  unknown: {
    headline: "⚠️ ยังยืนยันไม่ได้ว่าเว็บนี้ปลอดภัย",
    defaultReason: "ข้อมูลที่ระบบอ่านได้ยังไม่พอสำหรับการตัดสิน",
    actions: ["อย่าเพิ่งสมัครหรือโอนเงิน", "อย่ากรอกรหัสผ่าน รหัส OTP หรือข้อมูลบัตร", "ตรวจสอบกับแหล่งทางการก่อน"],
  },
};

function knownWebsite(finalUrl) {
  try {
    const hostname = new URL(finalUrl).hostname.toLowerCase();
    return KNOWN_WEBSITES.get(hostname.replace(/^www\./, "")) ?? null;
  } catch {
    return null;
  }
}

function formatAiClassification(result, options = {}) {
  const verdict = SENIOR_VERDICTS[result.category] ?? SENIOR_VERDICTS.unknown;
  const evidence = result.evidenceThai
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => `• ${item}`);
  const known = knownWebsite(options.finalUrl);
  const reason = result.summaryThai || verdict.defaultReason;

  return [
    "🛡️ ผลตรวจเว็บไซต์",
    `📌 สรุป: ${verdict.headline}`,
    known
      ? `🏢 เว็บไซต์: ใช้ชื่อเว็บทางการของ ${known.name} (${known.purpose})`
      : null,
    `🔎 เหตุผล: ${reason}`,
    evidence.length ? "👀 สิ่งที่ระบบพบ:\n" + evidence.join("\n") : null,
    options.imageUsed ? "🖼️ ระบบใช้ภาพตัวอย่างของเว็บไซต์ช่วยตรวจด้วย" : null,
    options.limitedContent
      ? "ℹ️ หน้าเว็บนี้อ่านข้อความได้ไม่ครบ ผลตรวจจึงอาศัยภาพและข้อมูลที่พบร่วมกัน"
      : null,
    "✅ ควรทำตอนนี้:",
    ...verdict.actions.map((action) => `• ${action}`),
    "ℹ️ หมายเหตุ: ผลตรวจช่วยประกอบการตัดสินใจ และไม่รับรองความปลอดภัย 100%",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatLimitedContentReply(url, content) {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Keep the original value if the URL cannot be parsed.
  }

  return [
    "🛡️ ผลตรวจเว็บไซต์",
    "📌 สรุป: ⚠️ ยังยืนยันไม่ได้ว่าเว็บนี้ปลอดภัย",
    `🌐 เว็บไซต์: ${hostname}`,
    "🔎 เหตุผล: หน้าเว็บนี้แสดงข้อมูลหลังจากเปิดในเบราว์เซอร์ ทำให้ระบบอ่านข้อความได้เพียงเล็กน้อย",
    "✅ ควรทำตอนนี้:",
    "• อย่าเพิ่งสมัครสมาชิกหรือเติมเงิน",
    "• อย่ากรอกรหัสผ่าน รหัส OTP หรือข้อมูลบัตร",
    "• ปิดหน้าเว็บ และตรวจสอบกับแหล่งทางการก่อน",
    content.title ? `🏷️ ชื่อที่เว็บแสดง: ${content.title}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function createCyberGuardReply(text, options = {}) {
  const urls = extractUrls(text).slice(0, 3);
  const aiEnabled = options.aiEnabled === true;

  if (urls.length === 0 || !aiEnabled) {
    return createReplyTextWithRedirects(text, options.redirectResolver);
  }

  const fetcher = options.contentFetcher ?? fetchWebContent;
  const redirectResolver = options.redirectResolver ?? resolveRedirectChain;
  const classifier = options.classifier ?? classifyWebsite;
  let firstContentResult = null;
  let usage = null;

  const redirectResults = await Promise.all(
    urls.map(async (url, index) => {
      try {
        if (index === 0) {
          firstContentResult = await fetcher(url, {
            maxChars: options.maxContentChars,
          });
          return firstContentResult;
        }
        return await redirectResolver(url);
      } catch (error) {
        return { errorCode: error.code ?? "UNKNOWN" };
      }
    })
  );

  const basicReply = createReplyText(text, redirectResults);
  const content = firstContentResult?.content;
  if (content?.previewImageUrl) {
    options.onPreview?.({
      imageUrl: content.previewImageUrl,
      title: content.title,
    });
  }

  if (!content?.text) {
    return `${basicReply}\n\n⚠️ ระบบอ่านเนื้อหาของเว็บไซต์นี้ไม่ได้ จึงยังยืนยันไม่ได้ว่าเว็บนี้ปลอดภัย`;
  }

  const limitedContent = content.limitedContent || content.text.length < 160;
  if (limitedContent && !content.previewImageUrl) {
    return formatLimitedContentReply(firstContentResult.finalUrl, content);
  }

  try {
    const startedAt = Date.now();
    const result = await classifier(
      {
        url: firstContentResult.finalUrl,
        ...content,
      },
      {
        apiKey: options.openaiApiKey,
        model: options.openaiModel,
        safetyIdentifier: options.safetyIdentifier,
        onUsage: (value) => {
          usage = value;
        },
      }
    );
    options.onAnalysis?.({
      status: "completed",
      category: result.category,
      riskLevel: result.riskLevel,
      durationMs: Date.now() - startedAt,
      estimatedCostUsd: usage?.estimatedCostUsd ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
    });
    return formatAiClassification(result, {
      finalUrl: firstContentResult.finalUrl,
      imageUsed: Boolean(content.previewImageUrl),
      limitedContent,
    }).slice(0, 4900);
  } catch (error) {
    options.onAnalysis?.({
      status: "failed",
      errorCode: error.code ?? "AI_ERROR",
    });
    return `${basicReply}\n\n⚠️ ระบบช่วยวิเคราะห์เนื้อหายังไม่พร้อม จึงยังยืนยันไม่ได้ว่าเว็บนี้ปลอดภัย`;
  }
}

module.exports = {
  createCyberGuardReply,
  formatAiClassification,
  formatLimitedContentReply,
  knownWebsite,
};
