const GOOGLE_SAFE_BROWSING_URL =
  "https://safebrowsing.googleapis.com/v5/urls:search";
const PHISHTANK_URL = "https://checkurl.phishtank.com/checkurl/";
const OPENPHISH_FEED_URL = "https://openphish.com/feed.txt";
let openPhishCache = { expiresAt: 0, urls: new Set() };

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

  try {
    const response = await fetchImpl(url, {
      ...options.request,
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`Reputation provider returned HTTP ${response.status}`);
      error.code = "REPUTATION_HTTP_ERROR";
      throw error;
    }

    const text = await response.text();
    if (text.length > 128 * 1024) {
      const error = new Error("Reputation response was too large");
      error.code = "REPUTATION_RESPONSE_TOO_LARGE";
      throw error;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function checkGoogleSafeBrowsing(urls, options = {}) {
  if (!options.apiKey) return null;

  const requestUrl = new URL(GOOGLE_SAFE_BROWSING_URL);
  requestUrl.searchParams.set("key", options.apiKey);
  for (const url of urls.slice(0, 50)) requestUrl.searchParams.append("urls", url);
  const result = await fetchJson(requestUrl, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    request: { method: "GET" },
  });

  const matches = Array.isArray(result.threats) ? result.threats : [];
  return {
    provider: "Google Safe Browsing",
    dangerous: matches.length > 0,
    threats: [...new Set(matches.flatMap((match) => match.threatTypes ?? []))],
  };
}

async function checkPhishTank(url, options = {}) {
  if (options.enabled !== true) return null;

  const body = new URLSearchParams({ url, format: "json" });
  if (options.appKey) body.set("app_key", options.appKey);
  const result = await fetchJson(PHISHTANK_URL, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    request: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Cyber-Guard-School-Project/1.0",
      },
      body,
    },
  });

  const details = result.results ?? {};
  const isTrue = (value) => value === true || value === "true" || value === "y";
  return {
    provider: "PhishTank",
    dangerous:
      isTrue(details.in_database) &&
      isTrue(details.verified) &&
      isTrue(details.valid),
    threats: isTrue(details.in_database) ? ["PHISHING"] : [],
  };
}

function normalizeForFeed(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function loadOpenPhishFeed(options = {}) {
  if (!options.fetchImpl && openPhishCache.expiresAt > Date.now()) {
    return openPhishCache.urls;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 7000);
  try {
    const response = await fetchImpl(OPENPHISH_FEED_URL, {
      headers: { "User-Agent": "Cyber-Guard-School-Project/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenPhish returned HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 5 * 1024 * 1024) {
      throw new Error("OpenPhish feed was too large");
    }
    const urls = new Set(
      text
        .split(/\r?\n/)
        .slice(0, 100000)
        .map((value) => normalizeForFeed(value.trim()))
        .filter(Boolean)
    );
    if (!options.fetchImpl) {
      openPhishCache = { expiresAt: Date.now() + 6 * 60 * 60 * 1000, urls };
    }
    return urls;
  } finally {
    clearTimeout(timer);
  }
}

async function checkOpenPhish(urls, options = {}) {
  if (options.enabled !== true) return null;
  const feed = await loadOpenPhishFeed(options);
  const dangerous = urls.some((url) => feed.has(normalizeForFeed(url)));
  return {
    provider: "OpenPhish",
    dangerous,
    threats: dangerous ? ["PHISHING"] : [],
  };
}

async function checkUrlReputation(urls, options = {}) {
  const uniqueUrls = [...new Set(urls)].slice(0, 10);
  const checks = [];

  if (options.googleApiKey) {
    checks.push(() =>
      checkGoogleSafeBrowsing(uniqueUrls, {
        apiKey: options.googleApiKey,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      })
    );
  }
  if (options.phishTankEnabled === true && uniqueUrls[0]) {
    checks.push(() =>
      checkPhishTank(uniqueUrls[0], {
        enabled: true,
        appKey: options.phishTankAppKey,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      })
    );
  }
  if (options.openPhishEnabled === true) {
    checks.push(() =>
      checkOpenPhish(uniqueUrls, {
        enabled: true,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      })
    );
  }

  const settled = await Promise.allSettled(checks.map((check) => check()));
  const providers = settled
    .filter((item) => item.status === "fulfilled" && item.value)
    .map((item) => item.value);
  const errors = settled.filter((item) => item.status === "rejected").length;
  const threats = [
    ...new Set(providers.flatMap((provider) => provider.threats ?? [])),
  ];

  return {
    status: providers.some((provider) => provider.dangerous)
      ? "dangerous"
      : providers.length > 0
        ? "not_found"
        : "unavailable",
    providers: providers.map((provider) => provider.provider),
    threats,
    errors,
  };
}

module.exports = {
  checkGoogleSafeBrowsing,
  checkPhishTank,
  checkOpenPhish,
  checkUrlReputation,
  loadOpenPhishFeed,
};
