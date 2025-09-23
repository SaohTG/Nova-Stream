# --- Build ---
FROM node:20-alpine AS build
WORKDIR /app

# Installe exactement selon package-lock.json (inclut shaka-player s’il est listé)
COPY package.json package-lock.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build

# --- Runtime (serve statique) ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# petit serveur statique avec fallback SPA
RUN npm i -g serve
COPY --from=build /app/dist ./dist

EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173", "-n"]
