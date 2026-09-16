const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");
const { findChromeExecutable } = require("../dynamicContentFetcher");

const assetDirectory = path.join(__dirname, "..", "public", "rich-menu");
const sourcePath = path.join(assetDirectory, "cyber-guard-theme-v2.jpg");
const outputPath = path.join(assetDirectory, "cyber-guard-menu-v3.jpg");

function createMarkup(sourceImage) {
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 1250px; height: 843px; overflow: hidden; }
      body {
        position: relative;
        background: #e9f8ff;
        color: #093b75;
        font-family: "Noto Sans Thai", "Leelawadee UI", Arial, sans-serif;
      }
      .art { display: block; width: 1250px; height: 843px; }
      .menu { position: absolute; inset: 0; display: flex; padding-top: 449px; }
      .item {
        width: 33.333%;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 39px 20px 0;
        text-shadow: 0 2px 0 rgba(255, 255, 255, 0.72);
      }
      .icon { font-size: 42px; line-height: 1; margin-bottom: 13px; }
      .title { font-size: 32px; font-weight: 800; line-height: 1.2; }
      .desc { margin-top: 13px; font-size: 18px; font-weight: 700; line-height: 1.35; }
      .link .title, .link .desc { color: #075f9f; }
      .text .title, .text .desc { color: #07508d; }
      .help .title, .help .desc { color: #064070; }
    </style>
  </head>
  <body>
    <img class="art" src="data:image/jpeg;base64,${sourceImage}" alt="Cyber-Guard Bot">
    <main class="menu">
      <section class="item link"><div class="icon">🔗</div><div class="title">ตรวจลิงก์</div><div class="desc">แตะแล้ววางลิงก์<br>ที่ต้องการตรวจ</div></section>
      <section class="item text"><div class="icon">💬</div><div class="title">ตรวจข้อความ</div><div class="desc">ส่งข้อความน่าสงสัย<br>มาให้ผมช่วยอ่าน</div></section>
      <section class="item help"><div class="icon">🆘</div><div class="title">ขอความช่วยเหลือ</div><div class="desc">ดูวิธีใช้งาน<br>และคำแนะนำ</div></section>
    </main>
  </body>
</html>`;
}

async function main() {
  const executablePath = findChromeExecutable();
  if (!executablePath) {
    throw new Error("Chrome executable was not found");
  }

  if (!fs.existsSync(sourcePath)) {
    throw new Error("Rich menu artwork is missing");
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const sourceImage = fs.readFileSync(sourcePath).toString("base64");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1250, height: 843 },
      deviceScaleFactor: 2,
    });
    await page.setContent(createMarkup(sourceImage), { waitUntil: "load" });
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
