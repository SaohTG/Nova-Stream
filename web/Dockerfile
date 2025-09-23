# ── Build ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# deps
COPY package.json package-lock.json* ./
RUN (npm ci || npm i) \
 && npm i shaka-player@^4.9.6 --no-audit --no-fund

# code + build
COPY . .
RUN npm run build

# ── Run (Nginx) ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
# SPA fallback + cache léger
RUN printf 'server{listen 80;server_name _; \
add_header Cache-Control "public, max-age=300"; \
gzip on;gzip_types text/css application/javascript application/json image/svg+xml; \
location / { try_files $uri /index.html; } }' > /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
