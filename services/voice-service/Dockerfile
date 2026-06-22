# Build context: repo root
#   docker build -f services/voice-service/Dockerfile -t voicehub-voice-service:latest .
# mediasoup yêu cầu Node >= 22
FROM node:22-bullseye

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 python3-pip make g++ pkg-config libssl-dev && \
    pip3 install --no-cache-dir invoke && \
    rm -rf /var/lib/apt/lists/*

COPY services/voice-service/package*.json ./

RUN npm install --ignore-scripts && npm install -g nodemon \
  && npm rebuild mediasoup --foreground-scripts
RUN test -x node_modules/mediasoup/worker/out/Release/mediasoup-worker \
  || (echo "mediasoup-worker build failed in image" && exit 1)
RUN mkdir -p /opt/voice-prebuilt && cp -a node_modules /opt/voice-prebuilt/

COPY shared /shared
RUN cd /shared && npm install --omit=dev --ignore-scripts
COPY services/voice-service/docker-entrypoint.sh /usr/local/bin/voice-docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/voice-docker-entrypoint.sh && \
    chmod +x /usr/local/bin/voice-docker-entrypoint.sh

COPY services/voice-service/ .
RUN node /shared/postinstall-link.cjs

EXPOSE 3005

ENTRYPOINT ["/usr/local/bin/voice-docker-entrypoint.sh"]
