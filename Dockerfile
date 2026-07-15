# Image tunggal untuk app (Next.js) dan worker (ping) — beda `command` di docker-compose.
# fping dibutuhkan worker (CLAUDE.md §7), openssl dibutuhkan Prisma engine di Debian slim.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends fping openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
