#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL e obrigatoria: o AiMerc utiliza somente PostgreSQL." >&2
  exit 1
fi

if [ -s /app/data/master.sqlite ] && [ ! -f /app/data/.postgres-migrated-v2 ]; then
  echo "Importando dados legados para PostgreSQL (execucao unica)..."
  node scripts/migrate-sqlite-to-postgres.js
  touch /app/data/.postgres-migrated-v2
fi

exec npm start
