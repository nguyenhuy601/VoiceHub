require('dotenv').config();
const app = require('./app');
const { connectDB, disconnectDB } = require('./config/mongo');
const { connectRedis } = require('/shared');

const PORT = process.env.PORT || 3001;

// Kết nối MongoDB
connectDB()
  .then(async () => {
    // Log MongoDB connection state
    const mongoose = require('mongoose');
    console.log('[AuthService] MongoDB readyState:', mongoose.connection.readyState, '(1=connected, 2=connecting, 0=disconnected)');
    console.log('[AuthService] MongoDB host:', mongoose.connection.host);
    console.log('[AuthService] MongoDB name:', mongoose.connection.name);
    
    // Kết nối Redis
    connectRedis();

    // Khởi động server
    app.listen(PORT, () => {
      console.log(`Auth Service đang chạy trên cổng ${PORT}`);
      console.log('[AuthService] ✅ Server ready to accept requests');
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await disconnectDB();
  process.exit(0);
});


