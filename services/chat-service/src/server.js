const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const http = require('http');
const app = require('./app');
const { connectDB, connectRedis } = require('/shared');
const initializeSocket = require('./socket/index');

const PORT = process.env.PORT || 3006;

// Tạo HTTP server
const server = http.createServer(app);

// Khởi tạo Socket.IO
const io = initializeSocket(server);

// Kết nối database
connectDB()
  .then(() => {
    // Kết nối Redis
    connectRedis();

    // Khởi động server
    server.listen(PORT, () => {
      console.log(`Chat Service đang chạy trên cổng ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

