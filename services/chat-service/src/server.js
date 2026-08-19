const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (process.env.NODE_ENV === 'production') {
  const chatInternalToken = String(process.env.CHAT_INTERNAL_TOKEN || '').trim();
  if (!chatInternalToken) {
    console.error('[chat-service] FATAL: CHAT_INTERNAL_TOKEN is required in production.');
    process.exit(1);
  }
}

const http = require('http');
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, disconnectRedis } = require('@enterprise/shared');
const initializeSocket = require('./socket/index');
const { runFriendDmConsumerLoop, stopFriendDmConsumer } = require('./workers/friendDmConsumer');
const {
  runOrgEventsConsumerLoop,
  stopOrgEventsConsumer,
} = require('./workers/orgEventsConsumer');
const {
  runMessageSearchIndexerLoop,
  stopMessageSearchIndexer,
} = require('./workers/messageSearchIndexer');
const {
  runProjectChatEventsConsumerLoop,
  stopProjectChatEventsConsumer,
} = require('./workers/projectChatEventsConsumer');
const { startStorageGcScheduler } = require('./jobs/storageGc');

const PORT = process.env.PORT || 3006;

function isChatSocketEnabled() {
  const raw = String(process.env.CHAT_SOCKET_ENABLED ?? 'false').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

// Tùy chọn DB riêng cho chat (scale-out / tách DB)
const mongoUri = (process.env.CHAT_MONGODB_URI || '').trim() || process.env.MONGODB_URI;

// Tạo HTTP server
const server = http.createServer(app);

// Socket.IO legacy (namespaces /friends, /servers) — mặc định tắt; canonical: socket-service /chat
if (isChatSocketEnabled()) {
  initializeSocket(server);
  console.warn(
    '[chat-service] CHAT_SOCKET_ENABLED=true — legacy Socket.IO active. Set false for socket-service canonical path.'
  );
} else {
  console.log(
    '[chat-service] Socket.IO disabled (CHAT_SOCKET_ENABLED=false). Realtime via socket-service namespace /chat.'
  );
}

// Kết nối database
connectDB(mongoUri)
  .then(() => {
    // Kết nối Redis
    connectRedis();

    runFriendDmConsumerLoop();

    runOrgEventsConsumerLoop();

    runProjectChatEventsConsumerLoop();

    runMessageSearchIndexerLoop();

    startStorageGcScheduler();

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
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  try {
    await stopFriendDmConsumer();
    await stopOrgEventsConsumer();
    await stopProjectChatEventsConsumer();
    await stopMessageSearchIndexer();
  } catch (e) {
    console.error('[chat-service] stop consumers', e.message);
  }
  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await disconnectRedis();
      await disconnectDB();
    } catch (e) {
      /* ignore */
    }
    process.exit(0);
  });
});

