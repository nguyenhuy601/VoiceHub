const mongoose = require('mongoose');

/**
 * Kết nối MongoDB cho Auth Service
 * @param {string} mongoUri - MongoDB connection string
 * @param {Object} options - Mongoose connection options
 * @returns {Promise<mongoose.Connection>}
 */
const connectDB = async (mongoUri = null, options = {}) => {
  try {
    const uri = mongoUri || process.env.MONGODB_URI;

    if (!uri) {
      throw new Error('MONGODB_URI is not defined');
    }

    // Kiểm tra xem có phải Atlas connection string không
    const isAtlas = uri.includes('mongodb+srv://') || uri.includes('mongodb.net');
    
    const defaultOptions = {
      serverSelectionTimeoutMS: 60000, // 60 seconds (tăng cho Atlas)
      socketTimeoutMS: 90000, // 90 seconds (tăng cho Atlas)
      connectTimeoutMS: 60000, // 60 seconds (tăng cho Atlas)
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 2, // Maintain at least 2 socket connections
      // Giữ connection sống
      heartbeatFrequencyMS: 10000, // Ping server mỗi 10 giây
      // Retry options cho Atlas
      retryWrites: true,
      retryReads: true,
      ...options,
    };
    
    if (isAtlas) {
      console.log('[AuthService] Connecting to MongoDB Atlas...');
      console.log('[AuthService] Using Atlas connection (mongodb+srv://)');
      console.log('[AuthService] SSL/TLS will be automatically enabled for Atlas');
    } else {
      console.log('[AuthService] Connecting to local MongoDB...');
    }

    const conn = await mongoose.connect(uri, defaultOptions);
    
    console.log(`[AuthService] MongoDB Connected: ${conn.connection.host}`);
    
    // Đợi connection sẵn sàng (readyState === 1)
    let retries = 0;
    while (mongoose.connection.readyState !== 1 && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }

    if (mongoose.connection.readyState !== 1) {
      console.warn('[AuthService] ⚠️ MongoDB connection not fully ready, but continuing...');
      console.warn('[AuthService] readyState:', mongoose.connection.readyState);
    }

    // Verify connection is ready (chỉ khi connection.db đã sẵn sàng)
    try {
      // Đợi thêm một chút để đảm bảo db object đã được khởi tạo
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (mongoose.connection.db && typeof mongoose.connection.db.admin === 'function') {
        await mongoose.connection.db.admin().ping();
        console.log('[AuthService] ✅ MongoDB connection verified and ready');
      } else {
        console.warn('[AuthService] ⚠️ MongoDB connection.db not available yet, skipping ping');
        console.warn('[AuthService] Connection will be verified on first query');
      }
    } catch (error) {
      console.error('[AuthService] ❌ MongoDB ping failed:', error.message);
      // Không throw error ở đây, chỉ log warning vì connection có thể vẫn hoạt động
      console.warn('[AuthService] Continuing despite ping failure...');
    }
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('[AuthService] MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[AuthService] ⚠️ Disconnected from MongoDB');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[AuthService] ✅ Reconnected to MongoDB');
    });
    
    mongoose.connection.on('connected', () => {
      console.log('[AuthService] ✅ Connected to MongoDB');
    });

    return conn;
  } catch (error) {
    console.error(`[AuthService] MongoDB connection error: ${error.message}`);
    throw error;
  }
};

/**
 * Đóng kết nối MongoDB
 */
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('[AuthService] MongoDB connection closed');
  } catch (error) {
    console.error('[AuthService] Error closing MongoDB connection:', error);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  mongoose,
};

