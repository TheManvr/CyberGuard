const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RICH_MENU_NAME,
  RICH_MENU_REQUEST,
  createRichMenuRequest,
  ensureCyberGuardRichMenu,
} = require("../richMenu");

test("defines three full-height menu areas for the primary user actions", () => {
  const request = createRichMenuRequest();

  assert.equal(request.size.width, 2500);
  assert.equal(request.size.height, 1686);
  assert.equal(request.areas.length, 3);
  assert.deepEqual(
    request.areas.map((area) => area.action.label),
    ["ตรวจลิงก์", "ตรวจข้อความ", "ขอความช่วยเหลือ"]
  );
  assert.deepEqual(request.areas[0].action, {
    type: "postback",
    label: "ตรวจลิงก์",
    data: "action=check_link",
    inputOption: "openKeyboard",
  });
  assert.deepEqual(
    request.areas.slice(1).map((area) => area.action.text),
    ["ตรวจข้อความ", "ขอความช่วยเหลือ"]
  );
  assert.equal(
    request.areas.reduce((total, area) => total + area.bounds.width, 0),
    2500
  );
  assert.ok(request.areas.every((area) => area.bounds.height === 1686));
});

test("creates, uploads, and sets the Cyber-Guard menu as default once", async () => {
  const calls = [];
  const client = {
    getRichMenuList: async () => ({ richmenus: [] }),
    createRichMenu: async (request) => {
      calls.push(["create", request]);
      return { richMenuId: "richmenu-created" };
    },
    setRichMenuImage: async (id, image) => {
      calls.push(["image", id, image.type]);
    },
    setDefaultRichMenu: async (id) => {
      calls.push(["default", id]);
    },
  };

  const result = await ensureCyberGuardRichMenu(client, Buffer.from("image"));

  assert.deepEqual(result, { richMenuId: "richmenu-created", created: true });
  assert.equal(calls[0][0], "create");
  assert.equal(calls[0][1].name, RICH_MENU_NAME);
  assert.deepEqual(calls.slice(1), [
    ["image", "richmenu-created", "image/jpeg"],
    ["default", "richmenu-created"],
  ]);
});

test("reuses an existing named menu without uploading another image", async () => {
  const calls = [];
  const client = {
    getRichMenuList: async () => ({
      richmenus: [{ richMenuId: "richmenu-existing", name: RICH_MENU_NAME }],
    }),
    createRichMenu: async () => {
      throw new Error("A matching menu should be reused");
    },
    setRichMenuImage: async () => {
      throw new Error("A matching menu should not be re-uploaded");
    },
    setDefaultRichMenu: async (id) => calls.push(id),
  };

  const result = await ensureCyberGuardRichMenu(client, Buffer.from("image"));

  assert.deepEqual(result, { richMenuId: "richmenu-existing", created: false });
  assert.deepEqual(calls, ["richmenu-existing"]);
});

test("does not expose mutable shared rich-menu request state", () => {
  const request = createRichMenuRequest();
  request.areas[1].action.text = "changed";

  assert.equal(RICH_MENU_REQUEST.areas[1].action.text, "ตรวจข้อความ");
});
