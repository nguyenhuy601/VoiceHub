# Build context: repo root
#   docker build -f services/project-service/Dockerfile -t voicehub-project-service:latest .
FROM node:20-alpine

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY services/project-service/package*.json ./
RUN npm install --ignore-scripts && npm install -g nodemon

COPY shared /shared
RUN cd /shared && npm install --omit=dev --ignore-scripts
COPY services/project-service/ .
RUN node /shared/postinstall-link.cjs

EXPOSE 3009

CMD ["node", "src/server.js"]
