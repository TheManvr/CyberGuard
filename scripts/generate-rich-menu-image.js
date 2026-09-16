const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");
const { findChromeExecutable } = require("../dynamicContentFetcher");

const outputPath = path.join(__dirname, "..", "public", "rich-menu", "main.jpg");

function createMarkup() {
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 1250px; height: 843px; overflow: hidden; }
      body {
        background: #eef6ff;
        color: #102a43;
        font-family: "Noto Sans Thai", "Leelawadee UI", Arial, sans-serif;
      }
      .header {
        height: 151px;
        display: flex;
        align-items: center;
        padding: 28px 52px;
        background: #123a62;
        color: #ffffff;
      }
      .shield { font-size: 65px; margin-right: 22px; }
      .brand { font-size: 34px; font-weight: 800; letter-spacing: 0; }
      .tagline { margin-top: 4px; font-size: 20px; color: #dbeafe; }
      .menu { display: flex; gap: 14px; padding: 20px; height: 692px; }
      .item {
        flex: 1;
        min-width: 0;
        border-radius: 8px;
        color: #ffffff;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 26px 20px;
        text-align: center;
      }
      .link { background: #0f766e; }
      .text { background: #2563eb; }
      .help { background: #b45309; }
      .icon { font-size: 98px; line-height: 1; margin-bottom: 30px; }
      .title { font-size: 39px; font-weight: 800; line-height: 1.2; }
      .desc { margin-top: 20px; font-size: 22px; line-height: 1.45; color: #f8fafc; }
      .tap { margin-top: 30px; font-size: 20px; font-weight: 700; }
    </style>
  </head>
  <body>
    <header class="header">
      <div class="shield">🛡️</div>
      <div>
        <div class="brand">Cyber-Guard Bot</div>
        <div class="tagline">ผู้ช่วยตรวจลิงก์และข้อความน่าสงสัย</div>
      </div>
    </header>
    <main class="menu">
      <section class="item link"><div class="icon">🔗</div><div class="title">ตรวจลิงก์</div><div class="desc">ส่งลิงก์ที่ไม่แน่ใจ<br>มาให้ผมช่วยดู</div><div class="tap">แตะเพื่อเริ่ม</div></section>
      <section class="item text"><div class="icon">💬</div><div class="title">ตรวจข้อความ</div><div class="desc">คัดลอกข้อความน่าสงสัย<br>มาให้ผมช่วยอ่าน</div><div class="tap">แตะเพื่อเริ่ม</div></section>
      <section class="item help"><div class="icon">🆘</div><div class="title">ขอความช่วยเหลือ</div><div class="desc">ดูวิธีใช้งาน<br>และคำแนะนำ</div><div class="tap">แตะเพื่อเริ่ม</div></section>
    </main>
  </body>
</html>`;
}

async function main() {
  const executablePath = findChromeExecutable();
  if (!executablePath) {
    throw new Error("Chrome executable was not found");
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1250, height: 843 },
      deviceScaleFactor: 2,
    });
    await page.setContent(createMarkup(), { waitUntil: "load" });
    await page.screenshot({ path: outputPath, type: "jpeg", quality: 82 });
  } finally {
    await browser.close();
  }

  const size = fs.statSync(outputPath).size;
  if (size > 1024 * 1024) {
    throw new Error("Rich menu image must be 1 MB or smaller");
  }
  console.log(`Created ${outputPath} (${size} bytes)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
