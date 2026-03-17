# Socket.IO Connection Error Guide

Hướng dẫn xử lý lỗi kết nối WebSocket/Socket.IO

## Lỗi Thường Gặp

### 1. **WebSocket connection failed: ws://localhost:3006/socket.io/**

**Nguyên nhân:**
- Chat service không đang chạy (port 3006)
- VITE_SOCKET_URL không được set đúng
- Firewall chặn cổng 3006
- CORS error

**Giải pháp:**

#### a) Kiểm tra Chat Service đang chạy
```bash
# Cách 1: Kiểm tra với curl
curl http://localhost:3006/health

# Cách 2: Docker - kiểm tra container
docker ps | grep chat-service

# Cách 3: Kiểm tra logs
docker logs <chat-service-container-id>
```

#### b) Kiểm tra .env file
```bash
# File: client/.env
VITE_SOCKET_URL=http://localhost:3006    # Phải đúng

# Development: http://localhost:3006
# Production: https://your-api.com
```

#### c) Kiểm tra VITE_SOCKET_URL trong browser
```javascript
// Mở DevTools console (F12) → paste code này:
console.log(import.meta.env.VITE_SOCKET_URL);
// Output phải là: http://localhost:3006
```

#### d) Kiểm tra Chrome DevTools
1. Mở DevTools (F12)
2. Kiểm tra tab **Console** → báo lỗi gì?
3. Kiểm tra tab **Network** → filter "socket.io" → xem request thất bại
4. Tab **Application** → **Storage** → **Cookies** → tìm "socket.io"

---

### 2. **Lỗi Authentication (Unauthorized)**

**Error message:** `Unauthorized` hoặc `Invalid token`

**Nguyên nhân:**
- Token hết hạn
- Token không được gửi lên server
- Token format không đúng

**Giải pháp:**
```javascript
// File: client/src/context/SocketContext.jsx
const token = localStorage.getItem('token');
console.log('Token:', token); // Ensure token exists

// Kiểm tra token format
// Phải là JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### 3. **CORS Error**

**Error message:**
```
Cross-Origin Request Blocked: ... Origin mismatch
```

**Giải pháp:**

File: `services/chat-service/src/socket/index.js`
```javascript
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});
```

---

### 4. **Connection Timeout**

**Error message:** Kết nối chậm hoặc bị timeout

**Giải pháp:**
```javascript
const newSocket = io(SOCKET_URL, {
  auth: { token },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,  // Tăng số lần retry
  timeout: 10000,             // Tăng timeout (ms)
});
```

---

## Debugging Steps

### Step 1: Kiểm tra Server Logs
```bash
# Terminal 1: Chạy chat-service
cd services/chat-service
npm run dev

# Xem output, nên thấy:
# ✅ Chat Service đang chạy trên cổng 3006
```

### Step 2: Kiểm tra Browser Console
```javascript
// Mở DevTools (F12) → paste:

// 1. Kiểm tra env
console.log('VITE_SOCKET_URL:', import.meta.env.VITE_SOCKET_URL);

// 2. Kiểm tra token
console.log('Token:', localStorage.getItem('token'));

// 3. Kiểm tra user context
// (Nếu dùng React DevTools)
```

### Step 3: Kiểm tra Port
```bash
# Kiểm tra port 3006 có mở không
netstat -tlnp | grep 3006

# Hoặc Windows:
netstat -ano | findstr :3006
```

### Step 4: Kiểm tra Docker
```bash
# Liệt kê container
docker ps

# Xem logs
docker logs <chat-service-id>

# Kiểm tra network
docker network ls
docker inspect <network-name>
```

---

## Socket Events Available

Sau khi kết nối thành công, có thể dùng các events:

```javascript
const { socket, emit, on } = useSocket();

// Listen messages
on('message:received', (message) => {
  console.log('New message:', message);
});

// Join room
emit('room:join', { roomId: 'room123' });

// Send message
emit('message:send', {
  roomId: 'room123',
  text: 'Hello!'
});

// Leave room
emit('room:leave', { roomId: 'room123' });
```

---

## Environment Variables

File: `client/.env`

```bash
# Required
VITE_API_URL=http://localhost:3000/api      # API Gateway
VITE_SOCKET_URL=http://localhost:3006       # Socket.IO

# Optional
VITE_APP_NAME=Voice Chat App
VITE_APP_VERSION=1.0.0
```

---

## Docker Compose Services

```bash
# Khởi động tất cả services
docker-compose up -d

# Kiểm tra status
docker-compose ps

# Xem logs
docker-compose logs chat-service

# Dừng services
docker-compose down
```

---

## Port Reference

| Service | Port | Protokol |
|---------|------|----------|
| API Gateway | 3000 | HTTP/REST |
| Auth Service | 3001 | HTTP/REST |
| Chat Service | 3006 | HTTP + WebSocket |
| User Service | 4001 | HTTP/REST |
| Client (Dev) | 5173 | HTTP |

---

## Checklist

Nếu kết nối không work, check qua list này:

- [ ] Chat service đang chạy: `curl http://localhost:3006/health`
- [ ] VITE_SOCKET_URL đúng trong `.env`
- [ ] Token hợp lệ (check localStorage: `localStorage.getItem('token')`)
- [ ] Port 3006 không bị firewall chặn
- [ ] Đã restart app sau khi chỉnh sửa `.env`
- [ ] Browser DevTools không báo CORS error
- [ ] Server logs không báo connection error

---

## Quick Fix

Nếu muốn test nhanh, dùng fallback connection:

```javascript
// File: client/src/context/SocketContext.jsx

// Thay đổi từ:
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3006';

// Thành:
const SOCKET_URL = 'http://localhost:3006'; // Hardcode for testing
```

Sau đó restart dev server.

---

## More Help

- [Socket.IO Documentation](https://socket.io/docs/)
- [Socket.IO Client](https://socket.io/docs/v4/client-api/)
- [Socket.IO Troubleshooting](https://socket.io/docs/v4/troubleshooting-connection-issues/)
