const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createGeneralChatReply,
  getQuickConversationReply,
  STICKER_REPLY,
} = require("../conversation");

test("greets the user and explains the bot in simple Thai", () => {
  const reply = getQuickConversationReply("สวัสดีครับ");

  assert.match(reply, /Cyber-Guard Bot/);
  assert.match(reply, /ส่งลิงก์หรือข้อความน่าสงสัย/);
  assert.match(reply, /รหัส OTP/);
});

test("has a friendly reply for a received sticker", () => {
  assert.match(STICKER_REPLY, /สวัสดีครับ/);
  assert.match(STICKER_REPLY, /อยากให้ผมช่วยดู/);
  assert.doesNotMatch(STICKER_REPLY, /สติกเกอร์/);
});

test("uses AI for a general question without storing the response", async () => {
  let request;
  const client = {
    responses: {
      create: async (value) => {
        request = value;
        return {
          model: "gpt-5.4-nano",
          output_text: "ได้ครับ วันนี้มีอะไรให้ช่วยครับ 😊",
          usage: {
            input_tokens: 50,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 20,
          },
        };
      },
    },
  };
  let usage;
  const reply = await createGeneralChatReply("วันนี้เป็นอย่างไรบ้าง", {
    client,
    safetyIdentifier: "hashed-user-id",
    onUsage: (value) => {
      usage = value;
    },
  });

  assert.match(reply, /มีอะไรให้ช่วย/);
  assert.equal(request.store, false);
  assert.equal(request.safety_identifier, "hashed-user-id");
  assert.match(request.instructions, /Only help with internet use/);
  assert.match(request.instructions, /delivery, shop, bank/);
  assert.match(request.instructions, /Never use 'ค่ะ' or 'คะ'/);
  assert.equal(usage.inputTokens, 50);
});
