FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Europe/Brussels
ENV TRANSCODE_MKV=1           # ← active MKV→MP4/AAC (faststart) côté API
RUN apk add --no-cache ffmpeg curl
RUN addgroup -S nodejs && adduser -S node -G nodejs

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/health || curl -fsS http://127.0.0.1:4000/api/health || exit 1

USER node
CMD ["node","--enable-source-maps","dist/main.js"]
