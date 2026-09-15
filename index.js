require("dotenv").config({ quiet: true });

const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const line = require("@line/bot-sdk");
const { DEFAULT_MODEL } = require("./aiClassifier");
const {
  HELP_REPLY,
  createGeneralChatReply,
  getQuickConversationReply,
} = require("./conversation");
const { extractUrls } = require("./linkAnalyzer");
const { createLogger } = require("./logger");
const { createCyberGuardReply } = require("./messageAnalyzer");
const { createRateLimiter } = require("./rateLimiter");
const { buildStatusImageMessage } = require("./statusIndicator");
const { version } = require("./package.json");

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const channelSecret = process.env.LINE_CHANNEL_SECRET;
const port = Number(process.env.PORT) || 3000;
const aiEnabled = /^(1|true|yes)$/i.test(
  process.env.AI_ANALYSIS_ENABLED ?? "false"
);
const dynamicAnalysisEnabled = /^(1|true|yes)$/i.test(
  process.env.DYNAMIC_ANALYSIS_ENABLED ?? "false"
);
const reputationCheckEnabled = /^(1|true|yes)$/i.test(
  process.env.REPUTATION_CHECK_ENABLED ?? "false"
);
const phishTankEnabled = /^(1|true|yes)$/i.test(
  process.env.PHISHTANK_ENABLED ?? "false"
);
const openPhishEnabled = /^(1|true|yes)$/i.test(
  process.env.OPENPHISH_ENABLED ?? "true"
);
const webResearchEnabled = /^(1|true|yes)$/i.test(
  process.env.WEB_RESEARCH_ENABLED ?? "false"
);
const webResearchMode =
  process.env.WEB_RESEARCH_MODE === "always" ? "always" : "on_demand";
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || DEFAULT_MODEL;
const webResearchModel = process.env.WEB_RESEARCH_MODEL || openaiModel;
const requestedMaxContentChars =
  Number(process.env.AI_MAX_CONTENT_CHARS) || 12000;
const maxContentChars = Math.min(
  Math.max(requestedMaxContentChars, 1000),
  20000
);
const aiRequestsPerHour = Math.min(
  Math.max(Number(process.env.AI_REQUESTS_PER_HOUR) || 10, 1),
  100
);
const aiRateLimiter = createRateLimiter({ limit: aiRequestsPerHour });
const logger = createLogger();

if (!channelAccessToken || !channelSecret) {
  console.error(
    "Missing LINE credentials. Add LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET to .env."
  );
  process.exit(1);
}

if (aiEnabled && !openaiApiKey) {
  console.error(
    "AI_ANALYSIS_ENABLED is true, but OPENAI_API_KEY is missing from .env."
  );
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);
app.use(
  "/assets",
  express.static(path.join(__dirname, "public"), { maxAge: "7d", immutable: true })
);
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken,
});

function getPublicBaseUrl(req) {
  const configuredUrl = process.env.PUBLIC_BASE_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  const host = req.get("host");
  return host && req.protocol === "https" ? `https://${host}` : null;
}

async function handleEvent(event, options = {}) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const sourceId =
    event.source?.userId ??
    event.source?.groupId ??
    event.source?.roomId ??
    "unknown-source";
  const hasUrl = extractUrls(event.message.text).length > 0;
  const quickReply = hasUrl
    ? null
    : getQuickConversationReply(event.message.text);
  const needsAi = aiEnabled && (hasUrl || !quickReply);
  const rateLimit = needsAi
    ? aiRateLimiter.check(sourceId)
    : { allowed: true };
  const useAi = needsAi && rateLimit.allowed;
  const safetyIdentifier = crypto
    .createHash("sha256")
    .update(sourceId)
    .digest("hex");
  const startedAt = Date.now();
  let previewImageUrl = null;
  let statusIndicator = null;
  let aiWasUsed = false;
  let replyText;

  if (hasUrl) {
    aiWasUsed = useAi;
    replyText = await createCyberGuardReply(event.message.text, {
      aiEnabled: useAi,
      dynamicAnalysisEnabled,
      reputationCheckEnabled,
      googleSafeBrowsingApiKey: process.env.GOOGLE_SAFE_BROWSING_API_KEY,
      phishTankEnabled,
      phishTankAppKey: process.env.PHISHTANK_APP_KEY,
      openPhishEnabled,
      webResearchEnabled: useAi && webResearchEnabled,
      webResearchMode,
      webResearchModel,
      maxContentChars,
      openaiApiKey,
      openaiModel,
      safetyIdentifier,
      onAnalysis: (details) => logger.info("ai_analysis", details),
      onPreview: ({ imageUrl }) => {
        previewImageUrl = imageUrl;
      },
      onStatus: ({ status }) => {
        statusIndicator = status;
      },
    });
  } else if (quickReply) {
    replyText = quickReply;
  } else if (useAi) {
    aiWasUsed = true;
    try {
      replyText = await createGeneralChatReply(event.message.text, {
        apiKey: openaiApiKey,
        model: openaiModel,
        safetyIdentifier,
        onUsage: (details) => logger.info("chat_ai_usage", details),
      });
    } catch (error) {
      logger.error("chat_ai_failed", {
        errorCode: error.code ?? "AI_ERROR",
      });
      replyText = HELP_REPLY;
    }
  } else {
    replyText = HELP_REPLY;
  }

  if (needsAi && !rateLimit.allowed) {
    const minutes = Math.ceil(rateLimit.retryAfterSeconds / 60);
    replyText += `\n\n⏳ จำกัดการวิเคราะห์ AI ชั่วคราว กรุณาลองอีกครั้งในประมาณ ${minutes} นาที`;
  }

  const messages = [
    {
      type: "text",
      text: replyText,
    },
  ];
  const statusImage = buildStatusImageMessage(
    statusIndicator,
    options.publicBaseUrl
  );
  if (statusImage) {
    messages.push(statusImage);
  }
  if (previewImageUrl) {
    messages.push({
      type: "image",
      originalContentUrl: previewImageUrl,
      previewImageUrl,
    });
  }

  const result = await client.replyMessage({
    replyToken: event.replyToken,
    messages,
  });

  logger.info("message_processed", {
    durationMs: Date.now() - startedAt,
    hadUrl: hasUrl,
    aiUsed: aiWasUsed,
  });
  return result;
}

app.get("/", (_req, res) => {
  res.status(200).send("Cyber-Guard Bot is running.");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "cyber-guard-bot",
    version,
    uptimeSeconds: Math.floor(process.uptime()),
    ai: {
      enabled: aiEnabled,
      model: aiEnabled ? openaiModel : null,
      requestsPerUserPerHour: aiEnabled ? aiRequestsPerHour : null,
    },
    checks: {
      dynamicPage: dynamicAnalysisEnabled,
      reputation: reputationCheckEnabled,
      openPhish: openPhishEnabled,
      webResearch: webResearchEnabled,
      webResearchMode,
    },
  });
});

app.post("/webhook", line.middleware({ channelSecret }), (req, res) => {
  const events = req.body?.events ?? [];
  const publicBaseUrl = getPublicBaseUrl(req);
  res.sendStatus(200);

  void Promise.all(events.map((event) => handleEvent(event, { publicBaseUrl }))).catch((error) => {
    logger.error("webhook_processing_failed", {
      errorCode: error.code ?? "PROCESSING_ERROR",
    });
  });
});

app.use((error, _req, res, _next) => {
  const status = error instanceof line.SignatureValidationFailed ? 401 : 500;
  logger.error("webhook_rejected", { status });
  res.sendStatus(status);
});

const server = app.listen(port, () => {
  logger.info("server_started", {
    port,
    aiEnabled,
    model: aiEnabled ? openaiModel : null,
  });
});

function shutdown(signal) {
  logger.info("server_stopping", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
