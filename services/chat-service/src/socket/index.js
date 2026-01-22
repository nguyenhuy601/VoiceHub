const { Server } = require('socket.io');
const { socketAuth } = require('/shared/middleware/auth');
const friendSocket = require('./friend.socket');
const serverSocket = require('./server.socket');

const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Socket authentication middleware
  io.use(socketAuth);

  // Namespace cho friend chat
  const friendNamespace = io.of('/friends');
  friendSocket(friendNamespace);

  // Namespace cho server/room chat
  const serverNamespace = io.of('/servers');
  serverSocket(serverNamespace);

  return io;
};

module.exports = initializeSocket;


