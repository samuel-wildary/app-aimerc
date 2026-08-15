FROM node:22-alpine AS build

WORKDIR /app
ARG VITE_API_URL=https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Bust build cache to ensure fresh dist build
ARG BUILD_ID=20260815-1330
RUN echo "Building AiMerc Dashboard Build: $BUILD_ID" && npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
