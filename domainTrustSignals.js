const DOMAIN_GROUPS = [
  {
    suffix: ".go.th",
    descriptionThai:
      "ชื่อเว็บอยู่ในกลุ่มหน่วยงานรัฐไทย ซึ่งมีเงื่อนไขการจดทะเบียนเฉพาะ",
  },
  {
    suffix: ".ac.th",
    descriptionThai:
      "ชื่อเว็บอยู่ในกลุ่มสถาบันการศึกษาไทย ซึ่งมีเงื่อนไขการจดทะเบียนเฉพาะ",
  },
  {
    suffix: ".co.th",
    descriptionThai:
      "ชื่อเว็บอยู่ในกลุ่มสำหรับนิติบุคคลที่จดทะเบียนในประเทศไทย",
  },
  {
    suffix: ".edu",
    descriptionThai:
      "ชื่อเว็บอยู่ในกลุ่มเพื่อการศึกษาของสหรัฐฯ หรือเป็นชื่อที่จดทะเบียนเดิม",
  },
];

const LIMITATION_THAI =
  "ส่วนท้ายของชื่อเว็บเพียงอย่างเดียว ยังไม่รับรองว่าทุกหน้าและทุกเนื้อหาปลอดภัย";

function hostnameFromValue(value) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function detectDomainRegistrationSignal(value) {
  const hostname = hostnameFromValue(value);
  if (!hostname) return null;

  const group = DOMAIN_GROUPS.find(
    (entry) => hostname.length > entry.suffix.length && hostname.endsWith(entry.suffix)
  );
  if (!group) return null;

  return {
    ...group,
    hostname,
    limitationThai: LIMITATION_THAI,
    aiContext:
      `${hostname} ends with ${group.suffix}. ${group.descriptionThai}. ` +
      "This is only a limited registration-context signal, not proof that the owner, every page, or its content is safe. " +
      "Do not let it override dangerous reputation data or suspicious website content.",
  };
}

module.exports = {
  detectDomainRegistrationSignal,
  DOMAIN_GROUPS,
  LIMITATION_THAI,
};
