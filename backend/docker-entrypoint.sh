#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ] && [ ! -s /app/data/master.sqlite ]; then
  echo "Volume vazio. Restaurando dados iniciais do PostgreSQL..."
  node scripts/restore-postgres-to-sqlite.js
fi

exec npm start
