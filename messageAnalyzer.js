const { classifyWebsite } = require("./aiClassifier");
const { fetchDynamicWebContent } = require("./dynamicContentFetcher");
const {
  createReplyText,
  createReplyTextWithRedirects,
  extractUrls,
} = require("./linkAnalyzer");
const { resolveRedirectChain } = require("./redirectResolver");
const { checkUrlReputation } = require("./reputationChecker");
const { fetchWebContent } = require("./webContentFetcher");
const { researchWebsiteReputation } = require("./webResearcher");
const { findOfficialDomain } = require("./officialDomainRegistry");
const { detectDomainRegistrationSignal } = require("./domainTrustSignals");

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
    headline: "🛡️ ตอนนี้ยังไม่พบสิ่งน่ากังวล",
    defaultReason: "ตอนนี้ยังไม่พบข้อความที่หลอกให้เสียเงินหรือส่งข้อมูล",
    actions: ["เปิดดูข้อมูลทั่วไปได้", "ก่อนกรอกรหัสหรือข้อมูลบัตร ให้ตรวจชื่อเว็บอีกครั้ง"],
  },
  unknown: {
    headline: "⚠️ ตอนนี้ยังบอกไม่ได้ว่าปลอดภัย",
    defaultReason: "ตอนนี้มีข้อมูลไม่พอสำหรับการตัดสิน",
    actions: ["อย่าเพิ่งสมัครหรือโอนเงิน", "อย่ากรอกรหัสผ่าน รหัส OTP หรือข้อมูลบัตร", "ตรวจสอบกับแหล่งทางการก่อน"],
  },
};

const DANGEROUS_CATEGORIES = new Set([
  "gambling",
  "phishing",
  "impersonation",
  "financial_scam",
  "suspicious",
]);

function reportStatus(options, status) {
  options.onStatus?.({ status });
}

function knownWebsite(finalUrl) {
  const entry = findOfficialDomain(finalUrl);
  return entry
    ? { ...entry, name: entry.organization, purpose: entry.purposeThai }
    : null;
}

function formatVerifiedOfficialReply(official, options = {}) {
  return [
    "🛡️ ผลตรวจเว็บไซต์",
    `📌 สรุป: ✅ เป็นเว็บไซต์ทางการของ ${official.organization}`,
    `📖 ใช้สำหรับ: ${official.purposeThai}`,
    "✅ เข้าใช้งานข้อมูลทั่วไปได้",
    "⚠️ อย่าบอกรหัส OTP หรือรหัสผ่านให้ผู้อื่นครับ",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatAiClassification(result, options = {}) {
  const databaseDanger = options.reputation?.status === "dangerous";
  const verdict = databaseDanger
    ? {
        headline: "⛔ มีข้อมูลเตือนว่าเว็บนี้อาจอันตราย",
        defaultReason: "มีข้อมูลเตือนว่าเว็บนี้อาจไม่ปลอดภัย",
        actions: [
          "อย่าเปิดเว็บนี้ต่อ",
          "อย่ากรอกข้อมูลหรือโอนเงิน",
          "ลบข้อความหรือลิงก์นี้ทิ้ง",
        ],
      }
    : SENIOR_VERDICTS[result.category] ?? SENIOR_VERDICTS.unknown;
  const known = knownWebsite(options.finalUrl);
  const reason = shortenForSenior(result.summaryThai || verdict.defaultReason);

  return [
    "🛡️ ผลตรวจเว็บไซต์",
    `📌 สรุป: ${verdict.headline}`,
    known
      ? `🏢 เป็นเว็บไซต์ทางการของ ${known.name}`
      : null,
    options.domainSignal
      ? `🏷️ ${options.domainSignal.seniorLabelThai}`
      : null,
    `🔎 เหตุผล: ${reason}`,
    "✅ ควรทำตอนนี้:",
    ...verdict.actions.slice(0, 2).map((action) => `• ${action}`),
    "⚠️ หากต้องกรอกรหัสหรือโอนเงิน ให้หยุดและตรวจสอบอีกครั้งครับ",
  ]
    .filter(Boolean)
    .join("\n");
}

function shortenForSenior(value, maxLength = 150) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function formatLimitedContentReply(url, content, domainSignal = null) {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Keep the original value if the URL cannot be parsed.
  }

  return [
    "🛡️ ผลตรวจเว็บไซต์",
    "📌 สรุป: ⚠️ ตอนนี้ยังบอกไม่ได้ว่าปลอดภัย",
    domainSignal ? `🏷️ ${domainSignal.seniorLabelThai}` : null,
    "🔎 เหตุผล: ตอนนี้ระบบอ่านข้อมูลของเว็บนี้ได้ไม่ครบ",
    "✅ ควรทำตอนนี้:",
    "• อย่าเพิ่งสมัครสมาชิก เติมเงิน หรือโอนเงิน",
    "• อย่ากรอกรหัสผ่าน รหัส OTP หรือข้อมูลบัตร",
    "• ตรวจสอบกับหน่วยงานหรือร้านค้าทางการก่อนครับ",
  ]
    .filter(Boolean)
    .join("\n");
}

async function createCyberGuardReply(text, options = {}) {
  const urls = extractUrls(text).slice(0, 3);
  const aiEnabled = options.aiEnabled === true;

  if (urls.length === 0 || (!aiEnabled && !options.reputationCheckEnabled)) {
    return createReplyTextWithRedirects(text, options.redirectResolver);
  }

  const fetcher = options.contentFetcher ?? fetchWebContent;
  const redirectResolver = options.redirectResolver ?? resolveRedirectChain;
  const classifier = options.classifier ?? classifyWebsite;
  const dynamicFetcher = options.dynamicContentFetcher ?? fetchDynamicWebContent;
  const reputationChecker = options.reputationChecker ?? checkUrlReputation;
  const researcher = options.webResearcher ?? researchWebsiteReputation;
  let firstContentResult = null;
  let usage = null;
  let dynamicUsed = false;
  let researchUsed = false;
  let reputation = null;

  const redirectResults = await Promise.all(
    urls.map(async (url, index) => {
      try {
        if (index === 0 && aiEnabled) {
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
  let content = firstContentResult?.content;
  const initialLimited =
    !content?.text || content.limitedContent || content.text.length < 160;

  if (aiEnabled && initialLimited && options.dynamicAnalysisEnabled) {
    try {
      const dynamicResult = await dynamicFetcher(
        firstContentResult?.finalUrl ?? urls[0],
        { maxChars: options.maxContentChars }
      );
      if ((dynamicResult.content?.text?.length ?? 0) > (content?.text?.length ?? 0)) {
        firstContentResult = dynamicResult;
        content = dynamicResult.content;
        dynamicUsed = true;
      }
    } catch (error) {
      options.onAnalysis?.({
        status: "dynamic_fetch_failed",
        errorCode: error.code ?? "DYNAMIC_FETCH_ERROR",
      });
    }
  }

  const finalUrl =
    firstContentResult?.finalUrl ?? redirectResults[0]?.finalUrl ?? urls[0];

  if (options.reputationCheckEnabled) {
    try {
      reputation = await reputationChecker([urls[0], finalUrl], {
        googleApiKey: options.googleSafeBrowsingApiKey,
        phishTankEnabled: options.phishTankEnabled,
        phishTankAppKey: options.phishTankAppKey,
        openPhishEnabled: options.openPhishEnabled,
      });
    } catch (error) {
      options.onAnalysis?.({
        status: "reputation_failed",
        errorCode: error.code ?? "REPUTATION_ERROR",
      });
    }
  }

  const official = findOfficialDomain(finalUrl);
  if (official && reputation?.status !== "dangerous") {
    options.onAnalysis?.({
      status: "official_domain_verified",
      officialDomain: official.domain,
      reputationStatus: reputation?.status ?? "disabled",
    });
    reportStatus(options, "verified_official");
    return formatVerifiedOfficialReply(official, {
      reputation,
      redirects: redirectResults[0]?.redirects ?? 0,
    });
  }

  const domainSignal = detectDomainRegistrationSignal(finalUrl);

  const researchRequested =
    options.webResearchMode === "always" || /ค้น(?:หา)?(?:ข้อมูล)?เพิ่ม/i.test(text);
  if (
    aiEnabled &&
    options.webResearchEnabled &&
    researchRequested &&
    reputation?.status !== "dangerous"
  ) {
    try {
      const research = await researcher(finalUrl, {
        apiKey: options.openaiApiKey,
        model: options.webResearchModel ?? options.openaiModel,
      });
      if (research.summary) {
        content = { ...(content ?? {}), externalResearch: research.summary };
        researchUsed = true;
      }
    } catch (error) {
      options.onAnalysis?.({
        status: "web_research_failed",
        errorCode: error.code ?? "WEB_RESEARCH_ERROR",
      });
    }
  }

  if (!aiEnabled) {
    if (reputation?.status === "dangerous") {
      reportStatus(options, "danger");
      return `${basicReply}\n\n⛔ มีข้อมูลเตือนว่าเว็บนี้อาจอันตราย\nอย่าเปิด อย่ากรอกข้อมูล และอย่าโอนเงินครับ`;
    }
    reportStatus(options, "caution");
    return basicReply;
  }

  if (content?.previewImageUrl) {
    options.onPreview?.({
      imageUrl: content.previewImageUrl,
      title: content.title,
    });
  }

  if (!content?.text && reputation?.status !== "dangerous") {
    reportStatus(options, "caution");
    return `${basicReply}\n\n⚠️ ระบบอ่านเนื้อหาของเว็บไซต์นี้ไม่ได้ จึงยังยืนยันไม่ได้ว่าเว็บนี้ปลอดภัย`;
  }

  const limitedContent =
    !content?.text || content.limitedContent || content.text.length < 160;
  const hasAnalysisImage = Boolean(
    content?.analysisImageUrl || content?.previewImageUrl
  );
  if (
    limitedContent &&
    !hasAnalysisImage &&
    reputation?.status !== "dangerous"
  ) {
    const limitedReply = formatLimitedContentReply(
      finalUrl,
      content ?? {},
      domainSignal
    );
    reportStatus(options, "caution");
    return limitedReply;
  }

  try {
    const startedAt = Date.now();
    const result = await classifier(
      {
        url: finalUrl,
        ...(content ?? {}),
        domainRegistrationSignal: domainSignal?.aiContext ?? null,
        reputation,
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
      reputationStatus: reputation?.status ?? "disabled",
      dynamicUsed,
      researchUsed,
    });
    reportStatus(
      options,
      reputation?.status === "dangerous" || DANGEROUS_CATEGORIES.has(result.category)
        ? "danger"
        : result.category === "legitimate"
          ? "likely_safe"
          : "caution"
    );
    return formatAiClassification(result, {
      finalUrl,
      domainSignal,
      imageUsed: hasAnalysisImage,
      limitedContent,
      renderedWithBrowser: dynamicUsed,
      reputation,
      researchUsed,
    }).slice(0, 4900);
  } catch (error) {
    options.onAnalysis?.({
      status: "failed",
      errorCode: error.code ?? "AI_ERROR",
    });
    reportStatus(options, "caution");
    return `${basicReply}\n\n⚠️ ระบบช่วยวิเคราะห์เนื้อหายังไม่พร้อม จึงยังยืนยันไม่ได้ว่าเว็บนี้ปลอดภัย`;
  }
}

module.exports = {
  createCyberGuardReply,
  formatAiClassification,
  formatLimitedContentReply,
  formatVerifiedOfficialReply,
  knownWebsite,
};
