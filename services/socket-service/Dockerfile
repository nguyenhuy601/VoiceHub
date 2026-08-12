# Build context: repo root
#   docker build -f services/socket-service/Dockerfile -t voicehub-socket-service:latest .
FROM node:20-alpine

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY services/socket-service/package*.json ./
RUN npm install --ignore-scripts && npm install -g nodemon

COPY shared /shared
RUN cd /shared && npm install --omit=dev --ignore-scripts
COPY services/socket-service/ .
RUN node /shared/postinstall-link.cjs

EXPOSE 3017

CMD ["node", "src/server.js"]
