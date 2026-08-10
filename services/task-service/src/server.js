require('dotenv').config();
const app = require('./app');

let logger;
try {
  logger = require('@enterprise/shared').logger;
} catch {
  logger = console;
}

const PORT = process.env.PORT || 3019;

const server = app.listen(PORT, () => {
  logger.info(`task-service scaffold đang chạy trên cổng ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
