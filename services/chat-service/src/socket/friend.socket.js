const messageService = require('../services/message.service');
const messageEvent = require('../events/message.event');

const friendSocket = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.user?.id || socket.user?._id;
    console.log(`User ${userId} connected to friend chat`);

    // Join room với user ID
    socket.join(`user:${userId}`);

    // Gửi tin nhắn
    socket.on('send_message', async (data) => {
      try {
        const { receiverId, content, messageType } = data;

        if (!receiverId || !content) {
          return socket.emit('error', { message: 'receiverId and content are required' });
        }

        const message = await messageService.createMessage({
          senderId: userId,
          receiverId,
          content,
          messageType: messageType || 'text',
        });

        // Emit event
        messageEvent.emit('message.created', message);

        // Gửi tin nhắn đến người nhận
        io.to(`user:${receiverId}`).emit('new_message', message);
        
        // Xác nhận cho người gửi
        socket.emit('message_sent', message);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Đánh dấu tin nhắn đã đọc
    socket.on('mark_read', async (data) => {
      try {
        const { messageId } = data;
        const message = await messageService.markAsRead(messageId, userId);
        
        if (message) {
          socket.emit('message_read', message);
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      const { receiverId } = data;
      if (receiverId) {
        io.to(`user:${receiverId}`).emit('user_typing', {
          userId,
          isTyping: true,
        });
      }
    });

    socket.on('stop_typing', (data) => {
      const { receiverId } = data;
      if (receiverId) {
        io.to(`user:${receiverId}`).emit('user_typing', {
          userId,
          isTyping: false,
        });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected from friend chat`);
    });
  });
};

module.exports = friendSocket;




