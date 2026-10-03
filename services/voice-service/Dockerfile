# Build context: repo root
#   docker build -f services/voice-service/Dockerfile -t voicehub-voice-service:latest .
# mediasoup yêu cầu Node >= 22
# bookworm: bullseye-security apt 404 (ffmpeg/python3-pip) làm CI build exit 100
FROM node:22-bookworm

WORKDIR /app

# mediasoup postinstall: pip --target invoke/meson (PEP 668 trên bookworm)
ENV DEBIAN_FRONTEND=noninteractive \
    npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    PIP_BREAK_SYSTEM_PACKAGES=1

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      python3 \
      python3-pip \
      make \
      g++ \
      pkg-config \
      libssl-dev \
      ffmpeg && \
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
