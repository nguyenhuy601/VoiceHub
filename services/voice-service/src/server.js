require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, logger } = require('/shared');
const roomManager = require('./sfu/roomManager');
const registerVoiceNamespace = require('./socket/voice.namespace');

const PORT = process.env.PORT || 3005;
const VOICE_SIGNAL_PATH = process.env.VOICE_SIGNAL_PATH || '/voice-socket';

// Kết nối MongoDB
connectDB()
  .then(() => {
    // Kết nối Redis
    connectRedis();

    return roomManager.init();
  })
  .then(() => {
    const server = http.createServer(app);
    const isProd = process.env.NODE_ENV === 'production';
    const corsList = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const voiceSocketCors =
      corsList.length === 0 ? (isProd ? false : true) : corsList.length === 1 ? corsList[0] : corsList;

    const io = new Server(server, {
      cors: {
        origin: voiceSocketCors,
        credentials: true,
      },
      path: VOICE_SIGNAL_PATH,
      transports: ['websocket', 'polling'],
    });

    registerVoiceNamespace(io);

    // Khởi động server HTTP + WS
    server.listen(PORT, () => {
      logger.info(`Voice Service đang chạy trên cổng ${PORT}`);
      logger.info(`Voice signaling path: ${VOICE_SIGNAL_PATH}, namespace: /voice`);
    });

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      await disconnectDB();
      server.close(() => process.exit(0));
    });
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

