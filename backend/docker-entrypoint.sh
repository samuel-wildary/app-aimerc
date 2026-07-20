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

installer_path="${AIMERC_AGENT_INSTALLER_PATH:-/app/data/downloads/AiMerc-Agent-Setup.exe}"
installer_url="${AIMERC_AGENT_DOWNLOAD_URL:-}"
if [ -n "$installer_url" ]; then
  echo "Verificando o instalador do agente..."
  mkdir -p "$(dirname "$installer_path")"
  installer_tmp="${installer_path}.tmp"
  if wget -q -O "$installer_tmp" "$installer_url" && [ -s "$installer_tmp" ]; then
    if [ -s "$installer_path" ] && cmp -s "$installer_tmp" "$installer_path"; then
      rm -f "$installer_tmp"
      echo "Instalador da VPS ja esta atualizado."
    else
      mv "$installer_tmp" "$installer_path"
      echo "Instalador atualizado em $installer_path"
    fi
  else
    rm -f "$installer_tmp"
    if [ -s "$installer_path" ]; then
      echo "Aviso: origem indisponivel; mantendo o instalador armazenado na VPS." >&2
    else
      echo "Aviso: nao foi possivel armazenar o instalador; o backend continuara iniciando." >&2
    fi
  fi
fi

exec npm start
