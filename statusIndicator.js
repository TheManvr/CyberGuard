const STATUS_ASSETS = {
  verified_official: {
    original: "safe.png",
    preview: "safe-preview.jpg",
  },
  likely_safe: {
    original: "likely-safe.png",
    preview: "likely-safe-preview.jpg",
  },
  caution: {
    original: "not-sure-complete.png",
    preview: "not-sure-complete-preview.jpg",
  },
  danger: {
    original: "not-safe.png",
    preview: "not-safe-preview.jpg",
  },
};

function buildStatusImageMessage(status, publicBaseUrl) {
  const asset = STATUS_ASSETS[status];
  if (!asset || !publicBaseUrl) {
    return null;
  }

  let baseUrl;
  try {
    baseUrl = new URL(publicBaseUrl);
  } catch {
    return null;
  }

  if (baseUrl.protocol !== "https:") {
    return null;
  }

  return {
    type: "image",
    originalContentUrl: new URL(`/assets/status/${asset.original}`, baseUrl).href,
    previewImageUrl: new URL(`/assets/status/${asset.preview}`, baseUrl).href,
  };
}

module.exports = { buildStatusImageMessage };
