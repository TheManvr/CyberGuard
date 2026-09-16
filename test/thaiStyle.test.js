const test = require("node:test");
const assert = require("node:assert/strict");

const { useKrubOnly } = require("../thaiStyle");

test("uses krub as the only Thai polite ending", () => {
  assert.equal(useKrubOnly("ช่วยตรวจให้ค่ะ"), "ช่วยตรวจให้ครับ");
  assert.equal(useKrubOnly("กดลิงก์นี้ไหมคะ?"), "กดลิงก์นี้ไหมครับ?");
  assert.equal(useKrubOnly("ข้อมูลปกติ"), "ข้อมูลปกติ");
});
