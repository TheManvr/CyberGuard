const { resolveRedirectChain } = require("./redirectResolver");
const { detectDomainRegistrationSignal } = require("./domainTrustSignals");

const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "cutt.ly",
  "is.gd",
  "shorturl.at",
  "tinyurl.com",
  "t.co",
]);

const SUSPICIOUS_WORDS = [
  "account",
  "bank",
  "confirm",
  "login",
  "password",
  "payment",
  "secure",
  "update",
  "verify",
  "wallet",
];

const REDIRECT_LABELS = new Set(["go", "l", "link", "r", "redirect", "s"]);

const URL_PATTERN = /(?<!@)\b(?:https?:\/\/|www\.)[^\s<>"']+|(?<![@\w])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi;

function cleanUrl(value) {
  return value.replace(/[.,!?;:)\]}]+$/g, "");
}

function extractUrls(text) {
  return [...new Set((text.match(URL_PATTERN) ?? []).map(cleanUrl))];
}

function parseUrl(value) {
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function analyzeUrl(value) {
  const url = parseUrl(value);
  const warnings = [];

  if (!url) {
    return { value, hostname: value, warnings: ["รูปแบบลิงก์ไม่ปกติ"] };
  }

  const hostname = url.hostname.toLowerCase();
  const searchableText = `${hostname}${url.pathname}${url.search}`.toLowerCase();

  if (url.protocol === "http:") {
    warnings.push("ไม่ได้เข้ารหัสด้วย HTTPS");
  }

  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    warnings.push("ใช้หมายเลข IP แทนชื่อเว็บไซต์");
  }

  if (hostname.includes("xn--")) {
    warnings.push("ชื่อเว็บไซต์มีอักขระที่อาจเลียนแบบตัวอักษรอื่น");
  }

  if (SHORTENER_HOSTS.has(hostname)) {
    warnings.push("เป็นลิงก์ย่อ จึงยังมองไม่เห็นปลายทางจริง");
  }

  const hostnameLabels = hostname.split(".");
  const pathParts = url.pathname.split("/").filter(Boolean);
  const redirectToken = pathParts[1] ?? "";
  const looksLikeRedirect =
    REDIRECT_LABELS.has(hostnameLabels[0]) &&
    REDIRECT_LABELS.has(pathParts[0]) &&
    redirectToken.length >= 5 &&
    /[a-z]/i.test(redirectToken) &&
    /\d/.test(redirectToken);

  if (looksLikeRedirect) {
    warnings.push("โครงสร้างคล้ายลิงก์ย่อหรือเปลี่ยนเส้นทางไปเว็บอื่น");
  }

  if (url.username || url.password) {
    warnings.push("มีข้อมูลผู้ใช้ซ่อนอยู่ในลิงก์");
  }

  if (hostnameLabels.length > 4) {
    warnings.push("มีชื่อเว็บไซต์ย่อยหลายชั้นผิดปกติ");
  }

  const matchedWords = SUSPICIOUS_WORDS.filter((word) =>
    searchableText.includes(word)
  );
  if (matchedWords.length > 0) {
    warnings.push("มีคำที่มักใช้ในหน้าหลอกให้เข้าสู่ระบบหรือยืนยันข้อมูล");
  }

  return {
    value,
    hostname,
    warnings,
    domainSignal: detectDomainRegistrationSignal(url),
  };
}

const RESOLUTION_ERROR_MESSAGES = {
  BLOCKED_ADDRESS: "ระบบไม่อนุญาตให้เปิดตรวจลิงก์นี้",
  BLOCKED_PORT: "ลิงก์นี้ใช้รูปแบบที่ระบบไม่อนุญาตให้ตรวจ",
  HTTP_STATUS: "เว็บไซต์ไม่ส่งข้อมูลที่ระบบอ่านได้",
  INVALID_URL: "อ่านที่อยู่เว็บไซต์นี้ไม่ได้",
  REDIRECT_LOOP: "ลิงก์พาไปวนซ้ำ จึงตรวจต่อไม่ได้",
  RESPONSE_TOO_LARGE: "หน้าเว็บไซต์มีข้อมูลมากเกินไป จึงตรวจได้ไม่ครบ",
  TIMEOUT: "เว็บไซต์ตอบช้าเกินไป จึงตรวจไม่สำเร็จ",
  TOO_MANY_REDIRECTS: "ลิงก์พาไปหลายเว็บเกินไป จึงตรวจต่อไม่ได้",
  UNSUPPORTED_CONTENT_TYPE: "เว็บไซต์ไม่ส่งข้อความที่ระบบอ่านได้",
  UNSUPPORTED_ENCODING: "เว็บไซต์ส่งข้อมูลในรูปแบบที่ระบบอ่านไม่ได้",
  UNSUPPORTED_PROTOCOL: "ลิงก์นี้ใช้รูปแบบที่ระบบไม่อนุญาต",
  URL_CREDENTIALS: "ลิงก์นี้มีข้อมูลซ่อนอยู่ จึงควรระวัง",
};

function combineAnalysis(analysis, resolution) {
  if (!resolution) {
    return analysis;
  }

  const warnings = [...analysis.warnings];
  let finalAnalysis = null;

  if (resolution.errorCode) {
    warnings.push(
      RESOLUTION_ERROR_MESSAGES[resolution.errorCode] ??
        "ไม่สามารถยืนยันเว็บไซต์ปลายทางได้"
    );
    return { ...analysis, warnings };
  }

  if (resolution.redirects > 0) {
    finalAnalysis = analyzeUrl(resolution.finalUrl);
    warnings.push(`ลิงก์นี้พาไปเว็บไซต์อื่น ${resolution.redirects} ครั้ง`);

    if (finalAnalysis.hostname !== analysis.hostname) {
      warnings.push(`เว็บไซต์ที่ลิงก์พาไปคือ: ${finalAnalysis.hostname}`);
    }

    for (const warning of finalAnalysis.warnings) {
      const finalWarning = `ปลายทาง: ${warning}`;
      if (!warnings.includes(finalWarning)) {
        warnings.push(finalWarning);
      }
    }
  }

  return {
    ...analysis,
    warnings,
    domainSignal: finalAnalysis?.domainSignal ?? analysis.domainSignal,
  };
}

function createReplyText(text, redirectResults = []) {
  const urls = extractUrls(text);

  if (urls.length === 0) {
    return "Cyber-Guard Bot ได้รับข้อความแล้ว 🛡️\n\nยังไม่พบลิงก์ในข้อความนี้";
  }

  const analyses = urls
    .slice(0, 3)
    .map((url, index) => combineAnalysis(analyzeUrl(url), redirectResults[index]));
  const warningCount = analyses.reduce(
    (total, analysis) => total + analysis.warnings.length,
    0
  );
  const heading =
    warningCount > 0
      ? "⚠️ ควรระวังก่อนเปิดเว็บนี้"
      : "🛡️ ยังไม่พบสิ่งผิดปกติจากลิงก์";
  const details = analyses
    .map((analysis, index) => {
      const result =
        analysis.warnings.length > 0
          ? analysis.warnings.map((warning) => `• ${warning}`).join("\n")
          : "• ยังไม่พบสิ่งผิดปกติจากลิงก์ที่ส่งมา";
      const domainSignal = analysis.domainSignal
        ? `\n• ${analysis.domainSignal.descriptionThai}\n• ${analysis.domainSignal.limitationThai}`
        : "";
      return `${index + 1}. ${analysis.hostname}\n${result}${domainSignal}`;
    })
    .join("\n\n");
  const extra =
    urls.length > analyses.length
      ? `\n\nยังมีอีก ${urls.length - analyses.length} ลิงก์ที่ไม่ได้แสดง`
      : "";

  return `${heading}\n\n${details}${extra}\n\nอย่าเพิ่งกรอกรหัสผ่าน รหัส OTP หรือข้อมูลบัตร/เงิน จนกว่าจะมั่นใจว่าเป็นเว็บที่ถูกต้อง`;
}

async function createReplyTextWithRedirects(text, resolver = resolveRedirectChain) {
  const urls = extractUrls(text).slice(0, 3);

  if (urls.length === 0) {
    return createReplyText(text);
  }

  const redirectResults = await Promise.all(
    urls.map(async (url) => {
      try {
        return await resolver(url);
      } catch (error) {
        return { errorCode: error.code ?? "UNKNOWN" };
      }
    })
  );

  return createReplyText(text, redirectResults);
}

module.exports = {
  analyzeUrl,
  createReplyText,
  createReplyTextWithRedirects,
  extractUrls,
};
