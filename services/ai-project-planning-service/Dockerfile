# Build context: repo root
#   docker build -f services/ai-project-planning-service/Dockerfile -t voicehub-ai-project-planning-service:latest .
FROM node:20-alpine

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY services/ai-project-planning-service/package*.json ./
RUN npm install --ignore-scripts && npm install -g nodemon

COPY shared /shared
RUN cd /shared && npm install --omit=dev --ignore-scripts
COPY services/ai-project-planning-service/ .
RUN node /shared/postinstall-link.cjs

EXPOSE 3025

CMD ["node", "src/server.js"]
