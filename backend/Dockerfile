FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src ./src/

RUN npx prisma generate \
  && npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ARG PORT=3001
ENV NODE_ENV=production
ENV PORT=${PORT}

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev \
  && npm install prisma@^6.9.0 --no-save \
  && npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE ${PORT}

CMD ["node", "dist/index.js"]
