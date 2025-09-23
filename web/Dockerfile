FROM node:20-alpine
WORKDIR /app

# Dépendances (on force la présence de shaka-player et on vérifie)
COPY package.json package-lock.json* ./
RUN npm pkg set dependencies.shaka-player="^4.9.6" \
 && (npm ci || npm i) \
 && node -e "console.log('shaka at:', require.resolve('shaka-player'))"

# Code + build
COPY . .
RUN npm run build

EXPOSE 5173
CMD ["npm","run","preview","--","--host","0.0.0.0","--port","5173"]
