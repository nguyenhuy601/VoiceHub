# Build context: repo root
#   docker build -f services/ai-task-worker/Dockerfile -t voicehub-ai-task-worker:latest .
FROM node:20-alpine

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY services/ai-task-worker/package*.json ./
RUN npm install --ignore-scripts && npm install -g nodemon

COPY shared /shared
RUN cd /shared && npm install --omit=dev --ignore-scripts
COPY services/ai-task-worker/ .
RUN node /shared/postinstall-link.cjs

CMD ["node", "src/worker.js"]
