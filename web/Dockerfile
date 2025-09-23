# Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN (npm ci || npm i) && npm i shaka-player@^4.9.6 --no-audit --no-fund
COPY . .
RUN npm run build

# Run (Nginx sur 8081)
FROM nginx:1.27-alpine
RUN printf 'server{listen 8081;server_name _; \
add_header Cache-Control "public, max-age=300"; \
gzip on;gzip_types text/css application/javascript application/json image/svg+xml; \
location / { try_files $uri /index.html; } }' \
> /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8081
