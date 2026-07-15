#!/bin/sh
# Migrate deploy idempoten — aman dijalankan tiap kali container app/worker start
# (Prisma cuma menerapkan migration yang belum tercatat di tabel _prisma_migrations).
set -e
npx prisma migrate deploy
exec "$@"
