const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");
const { findChromeExecutable } = require("../dynamicContentFetcher");

const assetDirectory = path.join(__dirname, "..", "public", "rich-menu");
const sourcePath = path.join(assetDirectory, "cyber-guard-theme-v2.jpg");
const outputPath = path.join(assetDirectory, "cyber-guard-menu-v4.jpg");

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
        color: #073b70;
        font-family: Tahoma, "Leelawadee UI", sans-serif;
      }
      .art { display: block; width: 1250px; height: 843px; }
      .menu { position: absolute; inset: 0; display: flex; padding-top: 449px; }
      .item {
        width: 33.333%;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 74px 20px 0;
      }
      .accent {
        width: 78px;
        height: 8px;
        margin-bottom: 22px;
        border-radius: 4px;
        background: #00d9ff;
        box-shadow: 0 0 14px rgba(0, 217, 255, 0.9);
      }
      .text .accent { background: #3698ff; box-shadow: 0 0 14px rgba(54, 152, 255, 0.9); }
      .help .accent { background: #30e4ba; box-shadow: 0 0 14px rgba(48, 228, 186, 0.9); }
      .title {
        color: #ffffff;
        font-size: 36px;
        font-weight: 800;
        line-height: 1.2;
        -webkit-text-stroke: 1.4px #073b70;
        text-shadow: 0 4px 0 #073b70, 0 7px 16px rgba(2, 47, 90, 0.35);
      }
      .desc {
        margin-top: 22px;
        color: #07508d;
        font-size: 18px;
        font-weight: 800;
        line-height: 1.45;
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.9);
      }
    </style>
  </head>
  <body>
    <img class="art" src="data:image/jpeg;base64,${sourceImage}" alt="Cyber-Guard Bot">
    <main class="menu">
      <section class="item link"><div class="accent"></div><div class="title">ตรวจลิงก์</div><div class="desc">แตะแล้ววางลิงก์<br>ที่ต้องการตรวจ</div></section>
      <section class="item text"><div class="accent"></div><div class="title">ตรวจข้อความ</div><div class="desc">ส่งข้อความน่าสงสัย<br>มาให้ผมช่วยอ่าน</div></section>
      <section class="item help"><div class="accent"></div><div class="title">ขอความช่วยเหลือ</div><div class="desc">ดูวิธีใช้งาน<br>และคำแนะนำ</div></section>
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
