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


print_agent_path="${AIMERC_PRINT_AGENT_INSTALLER_PATH:-/app/data/downloads/AiMerc-Pedidos-Agent-Windows.zip}"
print_agent_url="${AIMERC_PRINT_AGENT_DOWNLOAD_URL:-}"
if [ -n "$print_agent_url" ]; then
  echo "Verificando o pacote do Pedidos Agent..."
  mkdir -p "$(dirname "$print_agent_path")"
  print_agent_tmp="${print_agent_path}.tmp"
  if wget -q -O "$print_agent_tmp" "$print_agent_url" && [ -s "$print_agent_tmp" ]; then
    if [ -s "$print_agent_path" ] && cmp -s "$print_agent_tmp" "$print_agent_path"; then
      rm -f "$print_agent_tmp"
      echo "Pacote do Pedidos Agent ja esta atualizado."
    else
      mv "$print_agent_tmp" "$print_agent_path"
      echo "Pacote do Pedidos Agent atualizado em $print_agent_path"
    fi
  else
    rm -f "$print_agent_tmp"
    if [ -s "$print_agent_path" ]; then
      echo "Aviso: origem indisponivel; mantendo o pacote armazenado na VPS." >&2
    else
      echo "Aviso: nao foi possivel armazenar o Pedidos Agent; o backend continuara iniciando." >&2
    fi
  fi
fi

echo "Iniciando coletor central de catalogo na porta ${SCRAPER_PORT:-4300}..."
SCRAPER_PORT="${SCRAPER_PORT:-4300}" node src/catalog-collector/server.js &
collector_pid=$!

cleanup() {
  kill "$collector_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec npm start
