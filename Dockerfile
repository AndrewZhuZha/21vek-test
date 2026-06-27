FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/package-lock.json ./backend/
RUN npm install --omit=dev

COPY scripts/ ./scripts/
COPY data/ ./data/
COPY css/ ./css/
COPY js/ ./js/
COPY errors/ ./errors/
COPY assets/ ./assets/
COPY index.html ./
RUN npm run build
COPY backend/ ./backend/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["node", "backend/src/index.js"]
