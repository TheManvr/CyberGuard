const officialDomains = require("./data/official-domains.json");

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function validateRegistry(entries) {
  const seen = new Set();

  for (const entry of entries) {
    const domain = normalizeHostname(entry.domain ?? "");
    const validDomain =
      domain.length > 0 &&
      !domain.includes("/") &&
      !domain.includes(":") &&
      domain.includes(".");

    if (
      !validDomain ||
      seen.has(domain) ||
      entry.status !== "verified" ||
      !entry.organization ||
      !entry.purposeThai ||
      !/^https:\/\//i.test(entry.officialSource ?? "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.verifiedAt ?? "")
    ) {
      throw new Error(`Invalid official domain registry entry: ${entry.domain}`);
    }

    seen.add(domain);
  }
}

validateRegistry(officialDomains);

const registry = officialDomains
  .map((entry) => ({ ...entry, domain: normalizeHostname(entry.domain) }))
  .sort((a, b) => b.domain.length - a.domain.length);

function findOfficialDomain(value) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    if (url.protocol !== "https:") return null;

    const hostname = normalizeHostname(url.hostname);
    const entry = registry.find(
      (item) =>
        hostname === item.domain ||
        (item.allowSubdomains && hostname.endsWith(`.${item.domain}`))
    );

    return entry ? { ...entry, matchedHostname: hostname } : null;
  } catch {
    return null;
  }
}

module.exports = {
  findOfficialDomain,
  officialDomains: registry,
  validateRegistry,
};
