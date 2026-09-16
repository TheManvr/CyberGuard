function useKrubOnly(value) {
  return String(value).replace(/(?:ค่ะ|คะ)(?=$|[\s.!?…])/g, "ครับ");
}

module.exports = { useKrubOnly };
