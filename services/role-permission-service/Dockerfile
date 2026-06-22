# Build context: repo root
#   docker build -f services/role-permission-service/Dockerfile -t voicehub-role-permission-service:latest .
FROM node:20-alpine

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY services/role-permission-service/package*.json ./
RUN npm install --ignore-scripts && npm install -g nodemon

COPY shared /shared
RUN cd /shared && npm install --omit=dev --ignore-scripts
COPY services/role-permission-service/ .
RUN node /shared/postinstall-link.cjs

EXPOSE 3015

CMD ["node", "src/server.js"]
