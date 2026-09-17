const MAX_CONTEXTS = 500;
const CONTEXT_TTL_MS = 20 * 60 * 1000;

const STATUS_SUMMARIES = {
  verified_official: {
    result: "เป็นเว็บไซต์ทางการ",
    detail: "เว็บที่ลิงก์พาไปเป็นเว็บไซต์ทางการครับ",
  },
  likely_safe: {
    result: "ยังไม่พบสิ่งน่ากังวล",
    detail: "จากข้อมูลที่ตรวจได้ ยังไม่พบลักษณะหลอกลวงชัดเจนครับ",
  },
  caution: {
    result: "ยังยืนยันความปลอดภัยไม่ได้",
    detail: "ไม่ได้แปลว่าเป็นเว็บหลอก แต่ข้อมูลที่ตรวจได้ยังไม่พอครับ",
  },
  danger: {
    result: "มีความเสี่ยง ควรหลีกเลี่ยง",
    detail: "พบข้อมูลที่ควรระวัง จึงไม่แนะนำให้เปิดต่อหรือโอนเงินครับ",
  },
};

const recentAnalyses = new Map();

function isStatusFollowUp(text) {
  const value = String(text).replace(/\s+/g, "").trim();
  return [
    /ตรวจเสร็จ(?:แล้ว)?(?:ยัง|ไหม|หรือยัง|หรือเปล่า)/,
    /เสร็จ(?:แล้ว)?(?:ยัง|ไหม|หรือยัง|หรือเปล่า)/,
    /ผล(?:ตรวจ)?(?:เป็น|ว่า)?(?:ยังไง|อย่างไร|อะไร)/,
  ].some((pattern) => pattern.test(value));
}

function pruneExpired(now) {
  for (const [sourceId, value] of recentAnalyses) {
    if (now - value.createdAt > CONTEXT_TTL_MS) {
      recentAnalyses.delete(sourceId);
    }
  }
}

function rememberAnalysis(sourceId, status, now = Date.now()) {
  if (!sourceId || !STATUS_SUMMARIES[status]) return;

  pruneExpired(now);
  if (recentAnalyses.size >= MAX_CONTEXTS && !recentAnalyses.has(sourceId)) {
    recentAnalyses.delete(recentAnalyses.keys().next().value);
  }
  recentAnalyses.set(sourceId, { status, createdAt: now });
}

function getRecentAnalysisReply(sourceId, text, now = Date.now()) {
  if (!isStatusFollowUp(text)) return null;

  const latest = recentAnalyses.get(sourceId);
  if (!latest || now - latest.createdAt > CONTEXT_TTL_MS) {
    recentAnalyses.delete(sourceId);
    return null;
  }

  const summary = STATUS_SUMMARIES[latest.status];
  return [
    "✅ ตรวจเสร็จแล้วครับ",
    `📌 ผลล่าสุด: ${summary.result}`,
    `🔎 ${summary.detail}`,
    "⚠️ หากต้องกรอกรหัสหรือโอนเงิน ให้หยุดและตรวจสอบอีกครั้งครับ",
  ].join("\n");
}

function clearAnalysisContexts() {
  recentAnalyses.clear();
}

module.exports = {
  clearAnalysisContexts,
  getRecentAnalysisReply,
  isStatusFollowUp,
  rememberAnalysis,
};
