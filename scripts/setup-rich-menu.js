require("dotenv").config({ quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const line = require("@line/bot-sdk");
const { ensureCyberGuardRichMenu } = require("../richMenu");

const imagePath = path.join(
  __dirname,
  "..",
  "public",
  "rich-menu",
  "cyber-guard-theme-v2.jpg"
);
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

async function main() {
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is missing");
  if (!fs.existsSync(imagePath)) {
    throw new Error("Rich menu image is missing. Run npm run menu:image first.");
  }

  const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: token,
  });
  const imageClient = new line.messagingApi.MessagingApiBlobClient({
    channelAccessToken: token,
  });
  const result = await ensureCyberGuardRichMenu(
    client,
    fs.readFileSync(imagePath),
    { imageClient }
  );
  console.log(
    `${result.created ? "Created" : "Reused"} default rich menu: ${result.richMenuId}`
  );
}

main().catch((error) => {
  console.error(`Rich menu setup failed: ${error.message}`);
  process.exitCode = 1;
});
