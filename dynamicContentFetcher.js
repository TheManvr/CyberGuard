const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

const {
  defaultResolveAddresses,
  validateTarget,
  normalizeUrl,
} = require("./redirectResolver");
const {
  extractReadableContent,
  selectRelevantText,
} = require("./webContentFetcher");

function findChromeExecutable(configuredPath = process.env.CHROME_EXECUTABLE_PATH) {
  const candidates = [
    configuredPath,
    process.platform === "win32"
      ? path.join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe")
      : null,
    process.platform === "win32"
      ? path.join(
          process.env["PROGRAMFILES(X86)"] ?? "",
          "Google/Chrome/Application/chrome.exe"
        )
      : null,
    process.platform === "win32"
      ? path.join(
          process.env.LOCALAPPDATA ?? "",
          "Google/Chrome/Application/chrome.exe"
        )
      : null,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

async function fetchDynamicWebContent(startUrl, options = {}) {
  const executablePath = findChromeExecutable(options.executablePath);
  if (!executablePath) {
    const error = new Error("Chrome executable was not found");
    error.code = "BROWSER_NOT_FOUND";
    throw error;
  }

  const normalized = normalizeUrl(startUrl);
  const resolveAddresses = options.resolveAddresses ?? defaultResolveAddresses;
  await validateTarget(normalized, resolveAddresses, 3000);
  const browser = await chromium.launch({ executablePath, headless: true });
  const maxRequests = options.maxRequests ?? 100;
  const maxChars = options.maxChars ?? 12000;
  const checkedHosts = new Set();
  let requestCount = 0;

  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      bypassCSP: false,
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true,
      permissions: [],
      serviceWorkers: "block",
      viewport: { width: 430, height: 900 },
    });

    await context.route("**/*", async (route) => {
      requestCount += 1;
      const request = route.request();
      const resourceType = request.resourceType();
      if (requestCount > maxRequests || ["media", "font"].includes(resourceType)) {
        await route.abort();
        return;
      }

      try {
        const requestUrl = new URL(request.url());
        if (["data:", "blob:"].includes(requestUrl.protocol)) {
          await route.continue();
          return;
        }
        const safeUrl = normalizeUrl(requestUrl.href);
        const hostKey = `${safeUrl.protocol}//${safeUrl.hostname}`;
        if (!checkedHosts.has(hostKey)) {
          await validateTarget(safeUrl, resolveAddresses, 2500);
          checkedHosts.add(hostKey);
        }
        await route.continue();
      } catch {
        await route.abort();
      }
    });

    const page = await context.newPage();
    await page.addInitScript(() => {
      window.WebSocket = class BlockedWebSocket {
        constructor() {
          throw new Error("WebSocket disabled by Cyber-Guard");
        }
      };
      window.EventSource = class BlockedEventSource {
        constructor() {
          throw new Error("EventSource disabled by Cyber-Guard");
        }
      };
      window.RTCPeerConnection = undefined;
    });

    await page.goto(normalized.href, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs ?? 9000,
    });
    await page.waitForTimeout(options.settleMs ?? 1800);

    const finalUrl = normalizeUrl(page.url());
    await validateTarget(finalUrl, resolveAddresses, 2500);
    const html = await page.content();
    const extracted = extractReadableContent(html, maxChars, finalUrl);
    const renderedText = await page.locator("body").innerText({ timeout: 2000 });
    const text = selectRelevantText(
      extracted.title,
      extracted.description,
      renderedText.replace(/\s+/g, " ").trim(),
      maxChars
    );
    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: 55,
      fullPage: false,
    });

    return {
      finalUrl: finalUrl.href,
      redirects: finalUrl.href === normalized.href ? 0 : 1,
      content: {
        ...extracted,
        text,
        limitedContent: text.length < 160,
        analysisImageUrl: `data:image/jpeg;base64,${screenshot.toString("base64")}`,
        renderedWithBrowser: true,
      },
    };
  } finally {
    await browser.close();
  }
}

module.exports = { fetchDynamicWebContent, findChromeExecutable };
