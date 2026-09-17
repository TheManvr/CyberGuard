const STATUS_ASSETS = {
  verified_official: {
    original: "safe-card.png",
    preview: "safe-card-preview.jpg",
  },
  likely_safe: {
    original: "likely-safe-card.png",
    preview: "likely-safe-card-preview.jpg",
  },
  caution: {
    original: "not-sure-card.png",
    preview: "not-sure-card-preview.jpg",
  },
  danger: {
    original: "not-safe-card.png",
    preview: "not-safe-card-preview.jpg",
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
