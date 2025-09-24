# api/Dockerfile

# 1) Déps pour build
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 2) Build TypeScript
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# 3) Déps prod seules
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 4) Runtime mince + ffmpeg pour remux MKV→MP4
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg curl

# user non-root
RUN addgroup -S nodejs && adduser -S node -G nodejs

# copies finales
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 4000

# healthcheck HTTP
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/health || exit 1

USER node
CMD ["node", "--enable-source-maps", "dist/main.js"]
