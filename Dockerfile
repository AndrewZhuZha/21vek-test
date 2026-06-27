FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY backend/package.json ./backend/
RUN npm install --omit=dev

COPY backend/ ./backend/
COPY index.html ./
COPY css/ ./css/
COPY js/ ./js/
COPY assets/ ./assets/
COPY data/ ./data/
COPY errors/ ./errors/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "backend/src/index.js"]
