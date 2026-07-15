# Image tunggal untuk app (Next.js) dan worker (ping) — beda `command` di docker-compose.
# fping dibutuhkan worker (CLAUDE.md §7), openssl dibutuhkan Prisma engine di Debian slim.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends fping openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# package-lock.json TIDAK di-copy: dia digenerate di Mac dan lockfile-nya cuma
# mencatat binary native lightningcss untuk darwin, bukan linux-x64-gnu. Kalau
# lockfile ikut di-copy, npm install tidak akan menambah entry Linux yang hilang.
COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
