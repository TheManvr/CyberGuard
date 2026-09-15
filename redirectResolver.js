const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const blockedAddresses = new net.BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

class RedirectResolutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RedirectResolutionError";
    this.code = code;
  }
}

function normalizeUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    throw new RedirectResolutionError("INVALID_URL", "URL length is invalid");
  }

  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new RedirectResolutionError("INVALID_URL", "URL contains control characters");
  }

  const explicitScheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
  if (explicitScheme && !["http", "https"].includes(explicitScheme.toLowerCase())) {
    throw new RedirectResolutionError(
      "UNSUPPORTED_PROTOCOL",
      "Only HTTP and HTTPS are allowed"
    );
  }

  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url;

  try {
    url = new URL(normalized);
  } catch {
    throw new RedirectResolutionError("INVALID_URL", "URL cannot be parsed");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RedirectResolutionError(
      "UNSUPPORTED_PROTOCOL",
      "Only HTTP and HTTPS are allowed"
    );
  }

  if (url.username || url.password) {
    throw new RedirectResolutionError(
      "URL_CREDENTIALS",
      "Credentials in URLs are not allowed"
    );
  }

  if (url.port) {
    throw new RedirectResolutionError(
      "BLOCKED_PORT",
      "Only standard HTTP and HTTPS ports are allowed"
    );
  }

  url.hash = "";
  return url;
}

function getAddressFamily(address, family) {
  if (family === 4 || family === "IPv4") return 4;
  if (family === 6 || family === "IPv6") return 6;
  return net.isIP(address);
}

function isBlockedAddress(address, family) {
  const normalizedFamily = getAddressFamily(address, family);

  if (normalizedFamily !== 4 && normalizedFamily !== 6) {
    return true;
  }

  if (normalizedFamily === 6 && /^::ffff:/i.test(address)) {
    return true;
  }

  return blockedAddresses.check(
    address,
    normalizedFamily === 6 ? "ipv6" : "ipv4"
  );
}

function withoutIpv6Brackets(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

async function defaultResolveAddresses(hostname) {
  const unwrappedHostname = withoutIpv6Brackets(hostname);
  const literalFamily = net.isIP(unwrappedHostname);

  if (literalFamily) {
    return [{ address: unwrappedHostname, family: literalFamily }];
  }

  return dns.lookup(unwrappedHostname, { all: true, verbatim: true });
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RedirectResolutionError("TIMEOUT", "Operation timed out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function validateTarget(url, resolveAddresses, timeoutMs) {
  const addresses = await withTimeout(
    Promise.resolve(resolveAddresses(url.hostname)),
    timeoutMs
  );

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new RedirectResolutionError("DNS_ERROR", "No DNS address found");
  }

  const normalized = addresses.map((entry) => ({
    address: entry.address,
    family: getAddressFamily(entry.address, entry.family),
  }));

  if (normalized.some((entry) => isBlockedAddress(entry.address, entry.family))) {
    throw new RedirectResolutionError(
      "BLOCKED_ADDRESS",
      "Target resolves to a non-public address"
    );
  }

  return normalized;
}

function createPinnedLookup(address) {
  return (_hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    if (options?.all) {
      callback(null, [address]);
      return;
    }

    callback(null, address.address, address.family);
  };
}

function defaultRequestHeaders(url, address, timeoutMs) {
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: createPinnedLookup(address),
        maxHeaderSize: 8192,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          Connection: "close",
          "User-Agent": "Cyber-Guard-Bot-Link-Checker/1.0",
        },
      },
      (response) => {
        const location = Array.isArray(response.headers.location)
          ? response.headers.location[0]
          : response.headers.location;
        resolve({ status: response.statusCode ?? 0, location: location ?? null });
        response.destroy();
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new RedirectResolutionError("TIMEOUT", "Request timed out"));
    });
    request.once("error", reject);
    request.end();
  });
}

async function resolveRedirectChain(startUrl, options = {}) {
  const maxRedirects = options.maxRedirects ?? 5;
  const totalTimeoutMs = options.totalTimeoutMs ?? 4000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 1500;
  const resolveAddresses = options.resolveAddresses ?? defaultResolveAddresses;
  const requestHeaders = options.requestHeaders ?? defaultRequestHeaders;
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
      throw new RedirectResolutionError("TIMEOUT", "Resolution timed out");
    }

    const addresses = await validateTarget(
      currentUrl,
      resolveAddresses,
      remainingMs
    );
    const result = await requestHeaders(
      currentUrl,
      addresses[0],
      Math.min(requestTimeoutMs, remainingMs)
    );

    chain.push({ url: currentUrl.href, status: result.status });

    if (!REDIRECT_STATUSES.has(result.status) || !result.location) {
      return {
        finalUrl: currentUrl.href,
        redirects: chain.length - 1,
        chain,
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

  throw new RedirectResolutionError("UNKNOWN", "Redirect resolution failed");
}

module.exports = {
  RedirectResolutionError,
  createPinnedLookup,
  defaultResolveAddresses,
  isBlockedAddress,
  normalizeUrl,
  resolveRedirectChain,
  validateTarget,
};
