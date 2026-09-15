FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

COPY index.js linkAnalyzer.js redirectResolver.js webContentFetcher.js ./
COPY aiClassifier.js logger.js messageAnalyzer.js rateLimiter.js ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]
