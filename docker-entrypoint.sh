#!/bin/sh
set -e
echo "Setting up database..."
npx prisma db push --accept-data-loss
# Seed default admin user on first boot (safe to re-run)
npx tsx prisma/seed.ts 2>/dev/null || true
echo "Starting server..."
exec node server.js
