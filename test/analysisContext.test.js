const test = require("node:test");
const assert = require("node:assert/strict");

const {
  clearAnalysisContexts,
  getRecentAnalysisReply,
  isStatusFollowUp,
  rememberAnalysis,
} = require("../analysisContext");

test("answers a recent analysis follow-up with the saved verdict", () => {
  clearAnalysisContexts();
  rememberAnalysis("user-1", "caution", 1000);

  const reply = getRecentAnalysisReply("user-1", "ตรวจเสร็จยังครับ", 2000);

  assert.match(reply, /ตรวจเสร็จแล้ว/);
  assert.match(reply, /ยังยืนยันความปลอดภัยไม่ได้/);
});

test("does not treat unrelated questions as analysis follow-ups", () => {
  assert.equal(isStatusFollowUp("สวัสดีครับ"), false);
  assert.equal(isStatusFollowUp("ตรวจเสร็จหรือยัง"), true);
});

test("forgets expired analysis results", () => {
  clearAnalysisContexts();
  rememberAnalysis("user-1", "danger", 1000);

  assert.equal(
    getRecentAnalysisReply("user-1", "ผลตรวจเป็นยังไง", 1000 + 20 * 60 * 1000 + 1),
    null
  );
});
