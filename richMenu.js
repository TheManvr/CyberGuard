const RICH_MENU_NAME = "Cyber-Guard Main Menu v1";
const RICH_MENU_IMAGE_TYPE = "image/jpeg";

const MENU_ACTIONS = [
  { label: "ตรวจลิงก์", text: "ตรวจลิงก์" },
  { label: "ตรวจข้อความ", text: "ตรวจข้อความ" },
  { label: "ขอความช่วยเหลือ", text: "ขอความช่วยเหลือ" },
];

const RICH_MENU_REQUEST = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: RICH_MENU_NAME,
  chatBarText: "เมนูช่วยตรวจสอบ",
  areas: MENU_ACTIONS.map((item, index) => ({
    bounds: {
      x: index * 833,
      y: 0,
      width: index === 2 ? 834 : 833,
      height: 1686,
    },
    action: {
      type: "message",
      label: item.label,
      text: item.text,
    },
  })),
};

function createRichMenuRequest() {
  return structuredClone(RICH_MENU_REQUEST);
}

async function ensureCyberGuardRichMenu(client, imageBuffer, options = {}) {
  const list = await client.getRichMenuList();
  const existing = (list.richmenus ?? []).find(
    (menu) => menu.name === RICH_MENU_NAME
  );
  let richMenuId = existing?.richMenuId;
  let created = false;

  if (!richMenuId) {
    const response = await client.createRichMenu(createRichMenuRequest());
    richMenuId = response.richMenuId;
    const imageClient = options.imageClient ?? client;
    await imageClient.setRichMenuImage(
      richMenuId,
      new Blob([imageBuffer], { type: RICH_MENU_IMAGE_TYPE })
    );
    created = true;
  }

  await client.setDefaultRichMenu(richMenuId);
  return { richMenuId, created };
}

module.exports = {
  MENU_ACTIONS,
  RICH_MENU_IMAGE_TYPE,
  RICH_MENU_NAME,
  RICH_MENU_REQUEST,
  createRichMenuRequest,
  ensureCyberGuardRichMenu,
};
