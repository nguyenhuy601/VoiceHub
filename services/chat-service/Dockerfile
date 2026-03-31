# 1️⃣ Base image
FROM node:20-alpine

# 2️⃣ Set working dir
WORKDIR /app

# 3️⃣ Copy dependency files
COPY package*.json ./

# 4️⃣ Cài dependencies (và nodemon để dev mode dùng được)
RUN npm install && npm install -g nodemon

# 5️⃣ Copy toàn bộ code
COPY . .

# 6️⃣ Mở cổng app
EXPOSE 3006

# 7️⃣ Default command (dùng cho production)
CMD ["node", "src/server.js"]
