# 1️⃣ Base image
FROM node:20-alpine

# 2️⃣ Set working dir
WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

# 3️⃣ Copy dependency files (build context = repo root)
COPY api-gateway/package*.json ./

# 4️⃣ Cài dependencies (và nodemon để dev mode dùng được)
RUN npm install --ignore-scripts && npm install -g nodemon

# 5️⃣ Link @enterprise/shared tại build — không phụ thuộc mount runtime /shared
COPY shared /shared
RUN cd /shared && npm install --omit=dev --ignore-scripts
COPY api-gateway/docker-entrypoint.sh /usr/local/bin/api-gateway-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/api-gateway-entrypoint.sh && \
    chmod +x /usr/local/bin/api-gateway-entrypoint.sh

COPY api-gateway/ .
RUN node /shared/postinstall-link.cjs

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/api-gateway-entrypoint.sh"]
CMD ["node", "src/server.js"]
