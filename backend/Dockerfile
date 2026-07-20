FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
RUN mkdir -p /app/data/downloads /app/secrets

ENV NODE_ENV=production
ENV PORT=3000
ENV AIMERC_AGENT_INSTALLER_PATH=/app/data/downloads/AiMerc-Agent-Setup.exe

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
