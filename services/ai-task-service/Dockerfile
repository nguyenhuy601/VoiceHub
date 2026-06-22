# Build context: repo root
#   docker build -f services/ai-task-service/Dockerfile -t voicehub-ai-task-service:latest .
FROM node:20-alpine

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY services/ai-task-service/package*.json ./
RUN npm install --ignore-scripts && npm install -g nodemon

COPY shared /shared
RUN cd /shared && npm install --omit=dev --ignore-scripts
COPY services/ai-task-service/ .
RUN node /shared/postinstall-link.cjs

EXPOSE 3020

CMD ["node", "src/server.js"]
