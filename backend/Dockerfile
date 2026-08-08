FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache ca-certificates wget postgresql16-client

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
RUN mkdir -p /app/data/downloads /app/secrets

ENV NODE_ENV=production
ENV PORT=3000
ENV SCRAPER_PORT=4300
ENV AIMERC_SCRAPER_URL=http://127.0.0.1:4300
ENV AIMERC_AGENT_INSTALLER_PATH=/app/data/downloads/AiMerc-Agent-Setup.exe
ENV AIMERC_AGENT_DOWNLOAD_URL=https://github.com/samuel-wildary/app-aimerc/releases/latest/download/AiMerc-Agent-Setup.exe
ENV AIMERC_PRINT_AGENT_INSTALLER_PATH=/app/data/downloads/AiMerc-Pedidos-Agent-Windows.zip
ENV AIMERC_PRINT_AGENT_DOWNLOAD_URL=https://github.com/samuel-wildary/app-aimerc/releases/latest/download/AiMerc-Pedidos-Agent-Windows.zip

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
