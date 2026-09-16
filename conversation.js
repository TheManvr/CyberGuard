const OpenAI = require("openai");

const { DEFAULT_MODEL, estimateResponseCost } = require("./aiClassifier");
const { useKrubOnly } = require("./thaiStyle");

const WELCOME_REPLY = [
  "สวัสดีครับ 👋",
  "ผมคือ Cyber-Guard Bot ผู้ช่วยตรวจลิงก์และข้อความน่าสงสัย",
  "ส่งลิงก์หรือข้อความน่าสงสัยมาให้ผมช่วยตรวจได้เลยครับ",
  "ก่อนส่ง กรุณาอย่าส่งรหัสผ่าน รหัส OTP หรือข้อมูลบัตรนะครับ",
].join("\n");

const HELP_REPLY = [
  "🛡️ ผมช่วยอะไรได้บ้าง",
  "🔗 ตรวจลิงก์ว่าอาจเป็นเว็บพนัน เว็บหลอก หรือเว็บขโมยข้อมูลหรือไม่",
  "💬 ช่วยอ่านข้อความน่าสงสัยและอธิบายด้วยคำง่าย ๆ",
  "💬 ตอบคำถามเกี่ยวกับการใช้อินเทอร์เน็ตและความปลอดภัย",
  "ส่งลิงก์เต็มที่ขึ้นต้นด้วย http:// หรือ https:// มาได้เลยครับ",
].join("\n");

const STICKER_REPLY = [
  "สวัสดีครับ 😊",
  "มีลิงก์หรือข้อความที่อยากให้ผมช่วยดูไหมครับ",
].join("\n");

function normalizeMessage(text) {
  return text.trim().toLowerCase().replace(/[.!?。！？]+$/g, "").trim();
}

function getQuickConversationReply(text) {
  const normalized = normalizeMessage(text);

  if (/^(สวัสดี|สวัสดีครับ|สวัสดีค่ะ|หวัดดี|ดีครับ|ดีค่ะ|hello|hi)$/.test(normalized)) {
    return WELCOME_REPLY;
  }
  if (/^(ช่วยอะไรได้บ้าง|ทำอะไรได้บ้าง|วิธีใช้|ช่วยด้วย|help)$/.test(normalized)) {
    return HELP_REPLY;
  }
  if (/^(ขอบคุณ|ขอบคุณครับ|ขอบคุณค่ะ|thank you|thanks)$/.test(normalized)) {
    return "ยินดีครับ 😊 หากมีลิงก์หรือข้อความที่ไม่แน่ใจ ส่งมาให้ผมช่วยตรวจได้เลยครับ";
  }
  if (/^(คุณคือใคร|นี่คืออะไร|บอทอะไร)$/.test(normalized)) {
    return "ผมคือ Cyber-Guard Bot 🛡️ ผู้ช่วยตรวจลิงก์และข้อความน่าสงสัย และคุยตอบคำถามทั่วไปได้ครับ";
  }
  if (/^(ลาก่อน|บ๊ายบาย|บาย|ไปก่อนนะ|goodbye|bye)$/.test(normalized)) {
    return "ลาก่อนครับ 👋 ดูแลตัวเอง และอย่าลืมตรวจลิงก์ก่อนกรอกข้อมูลสำคัญนะครับ";
  }
  return null;
}

async function createGeneralChatReply(text, options = {}) {
  const quickReply = getQuickConversationReply(text);
  if (quickReply) return quickReply;

  if (!options.apiKey && !options.client) {
    return HELP_REPLY;
  }

  const client = options.client ?? new OpenAI({
    apiKey: options.apiKey,
    timeout: options.timeoutMs ?? 10000,
    maxRetries: options.maxRetries ?? 1,
  });
  const response = await client.responses.create({
    model: options.model ?? DEFAULT_MODEL,
    reasoning: { effort: "none" },
    store: false,
    safety_identifier: options.safetyIdentifier,
    max_output_tokens: 240,
    instructions:
      "You are Cyber-Guard Bot, a friendly Thai assistant designed for older adults. " +
      "Answer in simple, polite Thai using short sentences. Avoid technical jargon. " +
      "Use 'ครับ' as the only Thai polite ending. Never use 'ค่ะ' or 'คะ'. " +
      "Only help with internet use, suspicious messages, links, scams, and cyber safety. " +
      "If asked to act as another service such as a delivery, shop, bank, or customer-service bot, " +
      "politely say that you are Cyber-Guard Bot and offer help checking a suspicious message or link instead. " +
      "For cyber-safety questions, give cautious practical advice and never promise 100% safety. " +
      "Never ask for passwords, OTP codes, card details, or bank information. " +
      "For medical, legal, or financial decisions, encourage checking with a qualified person. " +
      "Keep the answer under 6 short lines and use at most 2 helpful emojis.",
    input: text.slice(0, 2000),
  });

  const model = response.model ?? options.model ?? DEFAULT_MODEL;
  const cost = estimateResponseCost(response.usage, model);
  options.onUsage?.({ model, ...cost });

  const reply = response.output_text
    ?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  return reply ? useKrubOnly(reply) : HELP_REPLY;
}

module.exports = {
  HELP_REPLY,
  STICKER_REPLY,
  WELCOME_REPLY,
  createGeneralChatReply,
  getQuickConversationReply,
};
