/* ========================================
   SOCKETCONTEXT.JSX - SOCKET.IO MANAGEMENT
   Quản lý WebSocket connection cho realtime features
   - Chat realtime
   - Online users tracking  
   - Voice chat signaling
   - Notifications realtime
   
   Kết nối đến: API Gateway (port 3000) -> socket-service
======================================== */

// Import hooks để build context
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Import Socket.IO client để kết nối WebSocket
// io: function tạo socket connection
import { io } from 'socket.io-client';

// Import useAuth để lấy user info và token
// Cần token để authenticate socket connection
import { useAuth } from './AuthContext';

// Tạo SocketContext
const SocketContext = createContext(null);

/* ========================================
   CUSTOM HOOK: useSocket()
   Cách dùng: const { socket, emit, on } = useSocket();
   
   Component nào cần realtime features → dùng hook này
   VD: ChatPage cần emit message và listen new messages
======================================== */
function useSocket() {
  const context = useContext(SocketContext);
  
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  
  return context;
}

// Export useSocket để dùng trong components
export { useSocket };

/* ========================================
   SOCKET SERVER URL
   - Lấy từ .env file: VITE_SOCKET_URL (ví dụ: http://localhost:3000)
   - Kết nối tới namespace /chat qua API Gateway (gateway proxy tới socket-service)
   - Production: https://your-gateway-domain/chat
======================================== */
const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
const SOCKET_URL = `${SOCKET_BASE_URL}/chat`;

// Log URL khi app start (giúp debug)
console.log('🔌 [Socket] Configuration:');
console.log('   URL:', SOCKET_URL);
console.log('   Base:', SOCKET_BASE_URL);
console.log('   Env VITE_SOCKET_URL:', import.meta.env.VITE_SOCKET_URL || '(not set - using default)');
if (!import.meta.env.VITE_SOCKET_URL) {
  console.warn('   ⚠️ VITE_SOCKET_URL not set in .env. Using default http://localhost:3000');
}
console.log('');

/* ========================================
   SOCKETPROVIDER COMPONENT
   Wrap trong main.jsx (bên trong AuthProvider)
   Tự động connect socket khi user login
======================================== */
function SocketProvider({ children }) {
  /* ----- GET USER INFO TỪ AUTHCONTEXT ----- */
  
  // Lấy user và isAuthenticated từ AuthContext
  // Cần user để gửi user info qua socket
  // Chỉ connect socket khi isAuthenticated = true
  const { user, isAuthenticated } = useAuth();
  
  /* ----- STATE MANAGEMENT ----- */
  
  // socket: Socket.IO instance (để emit và listen events)
  const [socket, setSocket] = useState(null);
  
  // connected: trạng thái kết nối (true/false)
  const [connected, setConnected] = useState(false);
  
  // connectionError: lỗi kết nối (null hoặc error object)
  const [connectionError, setConnectionError] = useState(null);
  
  // onlineUsers: danh sách user IDs đang online
  // Server emit 'users:online' → update list này
  const [onlineUsers, setOnlineUsers] = useState([]);

  /* ========================================
     useEffect: QUẢN LÝ SOCKET CONNECTION
     
     Luồng hoạt động:
     1. Khi user login (isAuthenticated=true) → connect socket
     2. Khi user logout → disconnect socket
     3. Auto reconnect nếu mất kết nối
     
     Dependencies: [isAuthenticated, user]
     → Re-run khi user login/logout
  ======================================== */
  useEffect(() => {
    // Chỉ connect khi user đã login
    if (isAuthenticated && user) {
      // Lấy token từ localStorage để authenticate
      const token = localStorage.getItem('token');
      if (!token || token === 'null' || token === 'undefined') {
        if (import.meta.env.DEV) {
          console.warn('⚠️ [Socket] Skip connect: token missing or invalid');
        }
        return undefined;
      }
      
      /* ----- TẠO SOCKET CONNECTION ----- */
      const newSocket = io(SOCKET_URL, {
        // auth: gửi token lên server để xác thực
        // Server sẽ verify token và lấy user info
        auth: { token },
        
        // transports: thử websocket trước, fallback sang polling
        // websocket: nhanh hơn, realtime hơn
        // polling: backup nếu websocket bị chặn (firewall)
        transports: ['websocket', 'polling'],
        
        // reconnection: true = auto reconnect nếu disconnect
        reconnection: true,
        
        // reconnectionDelay: 1s giữa mỗi lần thử reconnect
        reconnectionDelay: 1000,
        
        // reconnectionAttempts: thử 5 lần trước khi bỏ cuộc
        reconnectionAttempts: 5,
      });

      /* ===== SOCKET EVENT LISTENERS ===== */
      
      // Event: 'connect' - khi kết nối thành công
      newSocket.on('connect', () => {
        console.log('✅ [Socket] Connected successfully');
        console.log('   Socket ID:', newSocket.id);
        console.log('   URL:', SOCKET_URL);
        console.log('   Transport:', newSocket.io.engine.transport.name);
        
        setConnected(true);
        setConnectionError(null); // Clear error khi connect success
      });

      // Event: 'disconnect' - khi mất kết nối
      newSocket.on('disconnect', (reason) => {
        setConnected(false);

        // Chỉ log chi tiết trong môi trường dev để tránh spam console ở production
        if (import.meta.env.DEV) {
          console.warn('⚠️ [Socket] Disconnected');
          console.warn('   Reason:', reason);
        }

        // Phân loại nguyên nhân:
        // - server disconnect: có thể là lỗi cấu hình → lưu vào connectionError
        // - client disconnect / chuyển trang / reload: không coi là lỗi
        // - các lý do khác (ping timeout, transport close...): chỉ log nhẹ, không set error
        if (reason === 'io server disconnect') {
          if (import.meta.env.DEV) {
            console.error('   Server forced disconnect. Check server logs.');
          }
          setConnectionError(new Error('Server forced disconnect'));
        } else if (reason === 'io client disconnect') {
          setConnectionError(null);
        }
      });

      // Event: 'connect_error' - lỗi khi kết nối
      newSocket.on('connect_error', (error) => {
        console.error('❌ [Socket] Connection Error');
        console.error('   Message:', error.message);
        console.error('   Data:', error.data);
        console.error('   Trying to connect to:', SOCKET_URL);
        console.error('');
        console.error('   📋 Debugging checklist:');
        console.error('   1. Is api-gateway running? (Port 3000)');
        console.error('   2. Check if VITE_SOCKET_URL is correctly set in client/.env');
        console.error('   3. Try: curl http://localhost:3000/health');
        console.error('   4. Check gateway logs for websocket proxy errors');
        console.error('   5. Check socket-service logs for socket.io/auth errors');
        
        setConnectionError(error);
      });

      // Event: 'error' - khi có lỗi socket (auth errors, etc.)
      newSocket.on('error', (error) => {
        console.error('❌ [Socket] Socket Error');
        console.error('   Error:', error);
        
        setConnectionError(error);
      });

      /* ===== ONLINE USERS TRACKING ===== */
      
      // Event: 'users:online' - server gửi list users online
      // Chạy khi connect hoặc khi có user join/leave
      newSocket.on('users:online', (users) => {
        // users: array of user IDs ['user1', 'user2', ...]
        setOnlineUsers(users);
      });

      // Event: 'user:connected' - có user mới online
      newSocket.on('user:connected', (userId) => {
        // Thêm userId vào onlineUsers
        // Set: loại bỏ duplicates
        setOnlineUsers((prev) => [...new Set([...prev, userId])]);
      });

      // Event: 'user:disconnected' - có user offline
      newSocket.on('user:disconnected', (userId) => {
        // Remove userId khỏi onlineUsers
        setOnlineUsers((prev) => prev.filter((id) => id !== userId));
      });

      // Lưu socket instance vào state
      setSocket(newSocket);

      /* ----- CLEANUP FUNCTION ----- */
      // Chạy khi component unmount hoặc deps thay đổi
      return () => {
        // Đóng socket connection
        newSocket.close();
        
        // Clear socket state
        setSocket(null);
        setConnected(false);
        setConnectionError(null);
      };
    }
  }, [isAuthenticated, user]); // Re-run khi user login/logout

  /* ========================================
     HELPER FUNCTION: emit()
     Gửi event lên server
     
     Cách dùng:
     emit('message:send', { 
       roomId: 'room1', 
       text: 'Hello!' 
     });
     
     Check connected trước khi emit để tránh lỗi
  ======================================== */
  const emit = useCallback(
    (event, data) => {
      // Chỉ emit khi socket connected
      if (socket && connected) {
        socket.emit(event, data);
      } else {
        // Warn nếu chưa connected
        console.warn('Socket not connected. Cannot emit event:', event);
      }
    },
    [socket, connected] // Deps: re-create khi socket/connected change
  );

  /* ========================================
     HELPER FUNCTION: on()
     Listen event từ server
     
     Cách dùng:
     on('message:received', (message) => {
       console.log('New message:', message);
     });
     
     Dùng trong component với useEffect
  ======================================== */
  const on = useCallback(
    (event, callback) => {
      if (socket) {
        socket.on(event, callback);
      }
    },
    [socket]
  );

  /* ========================================
     HELPER FUNCTION: off()
     Remove event listener
     
     Quan trọng! Phải off trong cleanup để tránh memory leak
     
     Cách dùng:
     useEffect(() => {
       const handler = (msg) => console.log(msg);
       on('message', handler);
       
       return () => off('message', handler);
     }, []);
  ======================================== */
  const off = useCallback(
    (event, callback) => {
      if (socket) {
        socket.off(event, callback);
      }
    },
    [socket]
  );

  /* ========================================
     HELPER FUNCTION: joinRoom()
     Join chat room hoặc voice room
     
     Emit event 'room:join' với roomId
     Server sẽ add socket vào room
     Sau đó socket sẽ nhận events của room đó
  ======================================== */
  const joinRoom = useCallback(
    (roomId) => {
      emit('room:join', { roomId });
    },
    [emit] // Phụ thuộc emit function
  );

  /* ========================================
     HELPER FUNCTION: leaveRoom()
     Leave chat room hoặc voice room
     
     Emit 'room:leave' để server remove socket khỏi room
  ======================================== */
  const leaveRoom = useCallback(
    (roomId) => {
      emit('room:leave', { roomId });
    },
    [emit]
  );

  /* ========================================
     CONTEXT VALUE
     Provide cho components con
  ======================================== */
  const value = {
    socket,           // Socket instance (để custom operations)
    connected,        // Connection status: true/false
    connectionError,  // Connection error: null hoặc error object
    onlineUsers,      // Array of online user IDs
    emit,             // Function: emit(event, data)
    on,               // Function: on(event, callback)
    off,              // Function: off(event, callback)
    joinRoom,         // Function: joinRoom(roomId)
    leaveRoom,        // Function: leaveRoom(roomId)
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

// Export SocketProvider để dùng trong main.jsx
export { SocketProvider };

/* ========================================
   CÁCH DÙNG TRONG COMPONENT:
   
   import { useSocket } from './context/SocketContext';
   
   function ChatRoom({ roomId }) {
     const { socket, emit, on, off, joinRoom } = useSocket();
     const [messages, setMessages] = useState([]);
     
     // Join room khi component mount
     useEffect(() => {
       joinRoom(roomId);
     }, [roomId]);
     
     // Listen new messages
     useEffect(() => {
       const handleMessage = (msg) => {
         setMessages(prev => [...prev, msg]);
       };
       
       on('message:received', handleMessage);
       
       // Cleanup: off listener
       return () => off('message:received', handleMessage);
     }, [on, off]);
     
     // Send message
     const sendMessage = (text) => {
       emit('message:send', { roomId, text });
     };
     
     return <div>...</div>;
   }
======================================== */
