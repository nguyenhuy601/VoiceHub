# Build context: repo root
#   docker build -f services/auth-service/Dockerfile -t voicehub-auth-service:latest .
FROM node:20-alpine

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY services/auth-service/package*.json ./

RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm install --ignore-scripts && npm install -g nodemon \
  && apk del .build-deps

COPY shared /shared
RUN cd /shared && npm install --omit=dev --ignore-scripts
COPY services/auth-service/ .
RUN node /shared/postinstall-link.cjs

EXPOSE 3001

CMD ["node", "src/server.js"]
