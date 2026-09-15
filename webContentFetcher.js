const http = require("node:http");
const https = require("node:https");
const cheerio = require("cheerio");

const {
  RedirectResolutionError,
  createPinnedLookup,
  defaultResolveAddresses,
  normalizeUrl,
  validateTarget,
} = require("./redirectResolver");

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
];
const SIGNAL_TERMS = [
  "พนัน",
  "คาสิโน",
  "สล็อต",
  "บาคาร่า",
  "แทงบอล",
  "การเดิมพัน",
  "ฝากเงิน",
  "ถอนเงิน",
  "โบนัส",
  "เครดิตฟรี",
  "สมัครสมาชิก",
  "รหัสผ่าน",
  "otp",
  "บัตรเครดิต",
  "บัญชีธนาคาร",
  "โอนเงิน",
  "ลงทุน",
  "ผลตอบแทน",
  "รับรางวัล",
  "ยืนยันตัวตน",
  "wallet",
  "password",
  "login",
  "verify",
];

function requestPage(url, address, timeoutMs, maxBytes, captureBody) {
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    const request = transport.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: createPinnedLookup(address),
        maxHeaderSize: 8192,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "Accept-Encoding": "identity",
          Connection: "close",
          "User-Agent": "Cyber-Guard-Bot-Content-Checker/1.0",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const rawLocation = response.headers.location;
        const location = Array.isArray(rawLocation)
          ? rawLocation[0]
          : rawLocation ?? null;

        if (REDIRECT_STATUSES.has(status) && location) {
          response.destroy();
          finish(resolve, { status, location, body: null });
          return;
        }

        if (!captureBody) {
          response.destroy();
          finish(resolve, { status, location: null, body: null });
          return;
        }

        if (status < 200 || status >= 300) {
          response.destroy();
          finish(
            reject,
            new RedirectResolutionError(
              "HTTP_STATUS",
              `Website returned HTTP ${status}`
            )
          );
          return;
        }

        const contentEncoding = String(
          response.headers["content-encoding"] ?? "identity"
        ).toLowerCase();
        if (contentEncoding !== "identity") {
          response.destroy();
          finish(
            reject,
            new RedirectResolutionError(
              "UNSUPPORTED_ENCODING",
              "Compressed response was not requested"
            )
          );
          return;
        }

        const contentType = String(response.headers["content-type"] ?? "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
          response.destroy();
          finish(
            reject,
            new RedirectResolutionError(
              "UNSUPPORTED_CONTENT_TYPE",
              "Website did not return readable text or HTML"
            )
          );
          return;
        }

        const declaredLength = Number(response.headers["content-length"]);
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          response.destroy();
          finish(
            reject,
            new RedirectResolutionError(
              "RESPONSE_TOO_LARGE",
              "Website response is too large"
            )
          );
          return;
        }

        const chunks = [];
        let receivedBytes = 0;

        response.on("data", (chunk) => {
          receivedBytes += chunk.length;
          if (receivedBytes > maxBytes) {
            response.destroy();
            finish(
              reject,
              new RedirectResolutionError(
                "RESPONSE_TOO_LARGE",
                "Website response is too large"
              )
            );
            return;
          }
          chunks.push(chunk);
        });
        response.once("end", () => {
          finish(resolve, {
            status,
            location: null,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.once("error", (error) => finish(reject, error));
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new RedirectResolutionError("TIMEOUT", "Request timed out"));
    });
    request.once("error", (error) => finish(reject, error));
    request.end();
  });
}

function readMeta($, selectors) {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content");
    if (value) return value;
  }
  return "";
}

function safePreviewImageUrl(value, pageUrl) {
  if (!value || !pageUrl) return null;

  try {
    const imageUrl = new URL(value, pageUrl);
    if (
      imageUrl.protocol !== "https:" ||
      imageUrl.username ||
      imageUrl.password ||
      imageUrl.port ||
      imageUrl.hostname !== pageUrl.hostname
    ) {
      return null;
    }
    return imageUrl.href;
  } catch {
    return null;
  }
}

function scoreTextChunk(chunk) {
  const normalized = chunk.toLowerCase();
  return SIGNAL_TERMS.reduce((score, term) => {
    let matches = 0;
    let position = normalized.indexOf(term);
    while (position !== -1 && matches < 4) {
      matches += 1;
      position = normalized.indexOf(term, position + term.length);
    }
    return score + matches;
  }, 0);
}

function selectRelevantText(title, description, body, maxChars) {
  const prefix = [title, description].filter(Boolean).join("\n");
  const fullText = [prefix, body].filter(Boolean).join("\n");
  if (fullText.length <= maxChars) return fullText;

  const chunkSize = 700;
  const overlap = 80;
  const chunks = [];
  for (let start = 0; start < body.length; start += chunkSize - overlap) {
    const text = body.slice(start, start + chunkSize);
    chunks.push({ index: chunks.length, score: scoreTextChunk(text), text });
  }

  const separatorSize = 1;
  const availableChars = Math.max(maxChars - prefix.length - separatorSize, 0);
  const maxChunks = Math.max(Math.floor(availableChars / (chunkSize + 1)), 1);
  const rankedChunks = [...chunks].sort(
    (left, right) => right.score - left.score || left.index - right.index
  );
  const selectedIndexes = new Set();

  if (maxChunks === 1) {
    selectedIndexes.add(rankedChunks[0]?.index ?? 0);
  } else {
    selectedIndexes.add(0);
    if (maxChunks >= 3) {
      selectedIndexes.add(Math.max(chunks.length - 1, 0));
    }
  }

  for (const chunk of rankedChunks) {
    if (selectedIndexes.size >= maxChunks) break;
    selectedIndexes.add(chunk.index);
  }

  const selectedBody = [...selectedIndexes]
    .sort((left, right) => left - right)
    .map((index) => chunks[index]?.text)
    .filter(Boolean)
    .join("\n");

  return [prefix, selectedBody]
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars);
}

function extractReadableContent(html, maxChars = 12000, pageUrl = null) {
  const $ = cheerio.load(html);
  const clean = (value) => value.replace(/\s+/g, " ").trim();
  const ogTitle = readMeta($, [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ]);
  const ogDescription = readMeta($, [
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]);
  const previewImageUrl = safePreviewImageUrl(
    readMeta($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ]),
    pageUrl
  );
  const scriptCount = $("script").length;
  $("script, style, noscript, svg, iframe, template").remove();

  const title = clean($("title").first().text() || ogTitle);
  const description = clean(
    $('meta[name="description"]').attr("content") ?? ogDescription
  );
  const body = clean($("body").text() || $.root().text());
  const fullTextLength = [title, description, body]
    .filter(Boolean)
    .join("\n").length;
  const text = selectRelevantText(title, description, body, maxChars);

  return {
    title: title.slice(0, 300),
    description: description.slice(0, 600),
    previewImageUrl,
    text,
    truncated: fullTextLength > maxChars,
    limitedContent: body.length < 160 && scriptCount > 0,
  };
}

async function fetchWebContent(startUrl, options = {}) {
  const maxRedirects = options.maxRedirects ?? 5;
  const totalTimeoutMs = options.totalTimeoutMs ?? 7000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 2500;
  const maxBytes = options.maxBytes ?? 512 * 1024;
  const maxChars = options.maxChars ?? 12000;
  const resolveAddresses = options.resolveAddresses ?? defaultResolveAddresses;
  const request = options.requestPage ?? requestPage;
  const deadline = Date.now() + totalTimeoutMs;
  const chain = [];
  const visited = new Set();
  let currentUrl = normalizeUrl(startUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (visited.has(currentUrl.href)) {
      throw new RedirectResolutionError("REDIRECT_LOOP", "Redirect loop detected");
    }
    visited.add(currentUrl.href);

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new RedirectResolutionError("TIMEOUT", "Content fetch timed out");
    }

    const addresses = await validateTarget(
      currentUrl,
      resolveAddresses,
      remainingMs
    );
    const result = await request(
      currentUrl,
      addresses[0],
      Math.min(requestTimeoutMs, remainingMs),
      maxBytes,
      true
    );

    chain.push({ url: currentUrl.href, status: result.status });

    if (!REDIRECT_STATUSES.has(result.status) || !result.location) {
      return {
        finalUrl: currentUrl.href,
        redirects: chain.length - 1,
        chain,
        content: extractReadableContent(result.body ?? "", maxChars, currentUrl),
      };
    }

    if (redirectCount === maxRedirects) {
      throw new RedirectResolutionError(
        "TOO_MANY_REDIRECTS",
        "Redirect limit exceeded"
      );
    }

    currentUrl = normalizeUrl(new URL(result.location, currentUrl).href);
  }

  throw new RedirectResolutionError("UNKNOWN", "Content fetch failed");
}

module.exports = {
  extractReadableContent,
  fetchWebContent,
  requestPage,
  safePreviewImageUrl,
  selectRelevantText,
};
