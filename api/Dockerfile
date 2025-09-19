FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm i
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["node", "dist/main.js"]
