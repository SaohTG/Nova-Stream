FROM node:20-alpine
WORKDIR /app

# Installe les deps (lock ou non) puis force shaka-player
COPY package.json package-lock.json* ./
RUN (npm ci || npm i) \
 && npm i shaka-player@^4.9.6 --no-audit --no-fund

# Code + build
COPY . .
RUN npm run build

EXPOSE 5173
CMD ["npm","run","preview","--","--host","0.0.0.0","--port","5173"]
