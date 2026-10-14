#!/bin/sh
set -e
if [ -d prisma/migrations ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
else
  echo "No migrations folder found: syncing schema with prisma db push"
  npx prisma db push --skip-generate
fi
exec node dist/server.js
