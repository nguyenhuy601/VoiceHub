# VoiceHub

Tài liệu này mô tả toàn bộ dự án theo trạng thái mã nguồn hiện tại: kiến trúc tổng thể, luồng nghiệp vụ, vai trò từng service, cấu trúc thư mục/tầng, endpoint, cơ chế realtime, tích hợp liên dịch vụ và các điểm cần lưu ý khi viết đặc tả hệ thống.

## 1) Mục tiêu hệ thống

VoiceHub là nền tảng giao tiếp nội bộ theo kiến trúc microservices, tập trung vào:

- Xác thực và hồ sơ người dùng
- Kết bạn và trao đổi trực tiếp (DM)
- Tổ chức/doanh nghiệp và server nội bộ
- Phân quyền RBAC theo server
- Chat, họp voice, tài liệu, task
- Event webhook và notification
- Realtime qua Socket.IO

## 2) Bản đồ kiến trúc tổng thể

Luồng từ ngoài vào trong:

1. Client React gọi API qua API Gateway (port 3000).
2. API Gateway thực hiện xác thực JWT, sau đó kiểm tra quyền truy cập (RBAC) nếu cần.
3. Gateway proxy request đến service đích.
4. Service xử lý nghiệp vụ, đọc/ghi MongoDB, có thể dùng Redis cache.
5. Một số nghiệp vụ phát sinh event webhook sang Webhook Service (FastAPI).
6. Webhook Service tạo notification qua Notification Service.
7. Realtime đi qua Socket Service (port 3017) hoặc socket trong Chat Service (port 3006).

## 3) Danh sách service và cổng

### Core gateway

| Thành phần | Port | Vai trò |
|---|---:|---|
| API Gateway | 3000 | Cổng vào duy nhất cho REST API |

### Business services (Node.js)

| Service | Port | Vai trò chính |
|---|---:|---|
| auth-service | 3001 | Đăng ký/đăng nhập/JWT/verify email/reset password |
| notification-service | 3003 | Lưu và truy xuất thông báo |
| user-service | 3004 | Hồ sơ người dùng, trạng thái online/offline |
| voice-service | 3005 | Meeting, participant, trạng thái họp |
| chat-service | 3006 | Tin nhắn DM/room + socket nội bộ |
| task-service | 3009 | Quản lý task, comment, trạng thái |
| document-service | 3010 | Quản lý metadata tài liệu + version |
| organization-service | 3013 | Organization + server + member |
| friend-service | 3014 | Quan hệ bạn bè, lời mời, block/unblock |
| role-permission-service | 3015 | Role, UserRole, kiểm tra permission |
| socket-service | 3017 | Socket server độc lập cho realtime |

### Auxiliary service

| Service | Port | Vai trò |
|---|---:|---|
| webhook-service (Python FastAPI) | 3016 | Nhận sự kiện webhook, phát notification |

## 4) Công nghệ và nền tảng

- Frontend: React 18, React Router 6, Vite, Tailwind, Axios, Socket.IO client.
- Backend chính: Node.js + Express + Mongoose.
- Realtime: Socket.IO.
- Data: MongoDB Atlas (mỗi service một database logic), Redis cache.
- Tài liệu: metadata trong MongoDB; file thật có hướng tích hợp S3.
- Webhook: FastAPI + httpx (Python).
- Vận hành local: Docker Compose.

## 5) Cấu trúc thư mục theo tầng

```
VoiceHub/
  api-gateway/                # Lớp edge: auth, permission, proxy
  client/                     # Lớp presentation (React)
  services/
    auth-service/
    user-service/
    friend-service/
    organization-service/
    role-permission-service/
    chat-service/
    voice-service/
    task-service/
    document-service/
    notification-service/
    socket-service/
    webhook-service/          # Python
  shared/                     # Shared lib (mongo/redis/auth/webhook/logger)
```

Mẫu tầng chuẩn trong service Node:

1. src/server.js: khởi động, kết nối DB/Redis, graceful shutdown.
2. src/app.js: middleware chung + mount route + healthcheck.
3. src/routes: định nghĩa endpoint.
4. src/controllers: điều phối request/response.
5. src/services: business logic.
6. src/models: schema và index MongoDB.

## 6) API Gateway: vai trò và cơ chế

Gateway nằm ở api-gateway/src, gồm 3 lớp chính:

1. auth.middleware.js:
- Bỏ qua public route.
- Validate JWT (Bearer token).

2. permission.middleware.js:
- Map method + route thành action (ví dụ task:write).
- Tách serverId/organizationId từ query/params/body/header.
- Gọi role-permission-service để check quyền.

3. proxy.middleware.js:
- Tra service theo path.
- Forward request kèm x-user-id/x-user-email.
- Xử lý timeout, service down, proxy error.

Public route chính tại gateway:

- /api/auth/register
- /api/auth/login
- /api/auth/refresh-token
- /api/auth/forgot-password
- /api/auth/reset-password
- /api/auth/verify-email
- /health

## 7) Bảng định tuyến Gateway -> Service

| Prefix route | Service đích |
|---|---|
| /api/auth | auth-service |
| /api/users | user-service |
| /api/friends | friend-service |
| /api/organizations, /api/servers | organization-service |
| /api/roles, /api/permissions | role-permission-service |
| /api/messages, /api/chat | chat-service |
| /api/voice, /api/meetings | voice-service |
| /api/tasks, /api/work | task-service |
| /api/documents | document-service |
| /api/notifications | notification-service |

## 8) Phân tích nghiệp vụ theo từng service

### 8.1 auth-service

Chức năng:

- Register account với email/password và thông tin cá nhân cơ bản.
- Verify email trước khi kích hoạt tài khoản.
- Login phát access token + refresh token.
- Refresh token, logout, change password.
- Forgot/reset password.

Model chính:

- UserAuth: email, password hash, token verify/reset, refresh token, lock state.

Endpoint chính:

- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/refresh-token
- GET /api/auth/verify-email
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- POST /api/auth/logout
- POST /api/auth/change-password
- GET /api/auth/me

Điểm quan trọng:

- Sau verify email có gọi sang user-service để tạo profile (cross-service).
- Có cơ chế khóa tạm tài khoản sau nhiều lần login sai.

### 8.2 user-service

Chức năng:

- Quản lý profile người dùng.
- Tra cứu theo userId, username, phone.
- Cập nhật status online/offline/away/busy.

Model chính:

- UserProfile: userId duy nhất, username, displayName, avatar, bio, phone, preferences.

Endpoint chính:

- POST /api/users
- GET /api/users/me
- PATCH /api/users/me
- PATCH /api/users/me/status
- GET /api/users/search
- GET /api/users/phone/:phone
- GET /api/users/username/:username
- GET /api/users/:userId

### 8.3 friend-service

Chức năng:

- Gửi/chấp nhận/từ chối lời mời kết bạn.
- Danh sách bạn bè và lời mời.
- Block/unblock user.

Model chính:

- Friend: userId, friendId, status (pending/accepted/blocked), requestedBy.
- Friendship (legacy): tồn tại song song.

Endpoint chính:

- GET /api/friends
- POST /api/friends/request
- POST /api/friends/:friendId/accept
- POST /api/friends/:friendId/reject
- GET /api/friends/requests
- GET /api/friends/:friendId/relationship
- POST /api/friends/:friendId/block
- POST /api/friends/:friendId/unblock
- DELETE /api/friends/:friendId
- GET /api/friends/search

Cross-service:

- Gọi user-service để kiểm tra user và enrich dữ liệu.
- Gửi webhook friend events.

### 8.4 organization-service

Chức năng:

- Quản lý organization (cấp công ty) và server (không gian làm việc/chat).
- Thêm/xóa member trong server.

Model chính:

- Organization
- Server
- Membership, Department, Team (một phần theo nhánh legacy)

Endpoint chính:

- POST /api/organizations
- GET /api/organizations/:organizationId
- PATCH/PUT /api/organizations/:organizationId
- DELETE /api/organizations/:organizationId
- POST /api/servers
- GET /api/servers/organization/:organizationId
- GET /api/servers/:serverId
- POST /api/servers/:serverId/members
- DELETE /api/servers/:serverId/members/:userId
- PATCH/PUT /api/servers/:serverId
- DELETE /api/servers/:serverId

### 8.5 role-permission-service

Chức năng:

- Quản lý role theo server.
- Gán role cho user.
- Tính permission và phục vụ check permission cho gateway.

Model chính:

- Role: permissions theo resource/actions.
- UserRole: map user-server-role.

Endpoint chính:

- POST /api/roles
- GET /api/roles/server/:serverId
- GET /api/roles/:roleId
- POST /api/roles/assign
- POST /api/roles/remove
- GET /api/roles/user/:userId/server/:serverId
- PATCH/PUT /api/roles/:roleId
- DELETE /api/roles/:roleId
- POST /api/permissions/check
- GET /api/permissions/user/:userId/server/:serverId
- GET /api/permissions/user/:userId/server/:serverId/role

### 8.6 chat-service

Chức năng:

- Quản lý message cho DM và room trong cùng một service.
- Tích hợp socket nội bộ (socket/index).

Model chính:

- Message: senderId, receiverId hoặc roomId, content, messageType, read status.

Endpoint chính:

- POST /api/messages
- GET /api/messages
- GET /api/messages/:messageId
- PATCH /api/messages/:messageId/read
- DELETE /api/messages/:messageId

Lưu ý nghiệp vụ:

- DM đi theo receiverId.
- Room chat đi theo roomId.

### 8.7 voice-service

Chức năng:

- Quản lý lifecycle meeting: tạo/bắt đầu/kết thúc.
- Quản lý participants vào/ra cuộc họp.

Model chính:

- Meeting: hostId, participants, status, start/end time.

Endpoint chính:

- POST /api/meetings
- GET /api/meetings
- GET /api/meetings/:meetingId
- POST /api/meetings/:meetingId/start
- POST /api/meetings/:meetingId/end
- POST /api/meetings/:meetingId/participants
- DELETE /api/meetings/:meetingId/participants/:userId

Alias:

- /api/voice dùng cùng route với /api/meetings.

### 8.8 task-service

Chức năng:

- Tạo/sửa/xóa task.
- Theo dõi trạng thái, priority, due date.
- Comment vào task.

Model chính:

- Task: title, assigneeId, createdBy, organizationId, serverId, status, comments.

Endpoint chính:

- POST /api/tasks
- GET /api/tasks
- GET /api/tasks/:taskId
- PATCH/PUT /api/tasks/:taskId
- POST /api/tasks/:taskId/comments
- DELETE /api/tasks/:taskId

Alias:

- /api/work dùng chung task routes.

Cross-service:

- Validate organization/user qua service khác.
- Phát webhook task events.

### 8.9 document-service

Chức năng:

- Quản lý metadata tài liệu.
- Versioning cho tài liệu.

Model chính:

- Document: fileUrl, size, mimeType, version, previousVersions.

Endpoint chính:

- POST /api/documents
- GET /api/documents
- GET /api/documents/:documentId
- PATCH/PUT /api/documents/:documentId
- POST /api/documents/:documentId/versions
- DELETE /api/documents/:documentId

Lưu ý:

- ENV có cấu hình AWS S3; luồng upload thực tế cần kiểm tra thêm theo controller hiện hành.

### 8.10 notification-service

Chức năng:

- Lưu thông báo theo user.
- Đánh dấu đã đọc/đọc tất cả.

Model chính:

- Notification: userId, type, title, content, data, isRead.

Endpoint chính:

- POST /api/notifications
- POST /api/notifications/bulk
- GET /api/notifications
- GET /api/notifications/user/:userId
- PATCH /api/notifications/:notificationId/read
- PATCH /api/notifications/read-all
- DELETE /api/notifications/:notificationId

### 8.11 webhook-service (Python)

Chức năng:

- Nhận webhook từ các service Node.
- Xác thực bằng X-Webhook-Secret.
- Dispatch tới handler theo domain: friend/task/meeting/document/chat/role/organization.
- Gọi notification-service để tạo notification.

Endpoint chính:

- POST /webhook/friend
- POST /webhook/task
- POST /webhook/meeting
- POST /webhook/document
- POST /webhook/chat
- POST /webhook/role
- POST /webhook/organization

### 8.12 socket-service

Chức năng:

- Socket.IO server độc lập, namespace /chat.
- Xác thực token bằng middleware shared.
- Event friend:send forward qua chat-service để persist tin nhắn.

Event chính:

- Client emit: friend:send
- Server emit: friend:new_message, friend:sent, error

## 9) Luồng nghiệp vụ trọng tâm

### 9.1 Luồng đăng ký và kích hoạt tài khoản

1. Client gọi register.
2. auth-service tạo UserAuth ở trạng thái chưa active, sinh email token.
3. Gửi email verify (nếu cấu hình SMTP).
4. User verify email.
5. auth-service kích hoạt account và đồng bộ tạo profile ở user-service.

### 9.2 Luồng request API chuẩn

1. Client gửi request có Bearer token.
2. Gateway auth middleware verify token.
3. Gateway permission middleware map action + lấy server context.
4. Gateway gọi role-permission-service check.
5. Nếu allowed, proxy đến service nghiệp vụ.

### 9.3 Luồng kết bạn

1. Gửi lời mời tại friend-service.
2. Người nhận accept.
3. friend-service tạo cặp quan hệ accepted 2 chiều.
4. Gửi webhook friend event.
5. webhook-service tạo notification.

### 9.4 Luồng task

1. Tạo task tại task-service.
2. Validate assignee và organization qua service liên quan.
3. Lưu task.
4. Gửi webhook task_created/task_assigned.
5. notification-service lưu thông báo cho người liên quan.

### 9.5 Luồng chat realtime DM

1. Client connect socket-service namespace /chat.
2. Client emit friend:send.
3. socket-service gọi chat-service POST /api/messages.
4. Sau khi persist, socket-service emit friend:new_message cho người nhận.

## 10) Frontend: cấu trúc và luồng UI

Điểm vào:

- main.jsx: bọc BrowserRouter + ThemeProvider + AuthProvider + SocketProvider.

Định tuyến:

- App.jsx dùng lazy-loading và ProtectedRoute cho route cần đăng nhập.

Lớp gọi API:

- services/api.js: axios base URL /api, interceptor gắn token + xử lý lỗi tập trung.

Context quan trọng:

- AuthContext: checkAuth/login/register/logout.
- SocketContext: connect/disconnect, emit/on/off, theo dõi online users.
- ThemeContext: quản lý theme giao diện.

## 11) Cơ chế dữ liệu

- MongoDB Atlas: mỗi service dùng DB riêng (auth_db, user_db, chat_db, ...).
- Redis: cache permission, friend list và các dữ liệu nóng.

Entity cốt lõi toàn hệ:

- Identity: UserAuth + UserProfile
- Social: Friend
- Org: Organization, Server, Membership
- Access control: Role, UserRole
- Communication: Message, Meeting
- Work: Task
- Content: Document
- Notification: Notification

## 12) Chạy hệ thống

### 12.1 Chạy bằng Docker Compose

Cấu trúc: `docker-compose.yml` (entry — `include` infra + core), `docker-compose.infra.yml`, `docker-compose.core.yml`, `docker-compose.dev.yml` (nodemon). Chi tiết: `docs/DOCKER-COMPOSE.md`.

**Mặc định (Mongo + Redis + toàn bộ app, không nodemon):**
```bash
docker compose up -d --build
```

**Dev (hot reload):**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

```bash
docker compose ps
docker compose logs -f api-gateway
```

Các cổng quan trọng:

- API Gateway: http://localhost:3000
- Client dev (Vite): http://localhost:5173
- Webhook: http://localhost:3016
- Socket: http://localhost:3017

### 12.2 Chạy thủ công (không Docker)

1. Chạy MongoDB và Redis.
2. Mỗi service copy ENV.example -> .env và chỉnh biến môi trường.
3. Chạy lần lượt service + gateway + client:

```bash
cd services/auth-service && npm install && npm run dev
cd services/user-service && npm install && npm run dev
cd services/friend-service && npm install && npm run dev
cd services/organization-service && npm install && npm run dev
cd services/role-permission-service && npm install && npm run dev
cd services/chat-service && npm install && npm run dev
cd services/voice-service && npm install && npm run dev
cd services/task-service && npm install && npm run dev
cd services/document-service && npm install && npm run dev
cd services/notification-service && npm install && npm run dev
cd services/socket-service && npm install && npm run dev
cd api-gateway && npm install && npm run dev
cd client && npm install && npm run dev
```

Webhook service (Python):

```bash
cd services/webhook-service
pip install -r requirements.txt
python main.py
```

## 13) Biến môi trường trọng yếu

Nhóm biến bắt buộc:

- JWT_SECRET (đồng bộ giữa auth, gateway, socket, shared auth).
- MONGODB_URI cho từng service.
- REDIS_HOST, REDIS_PORT.
- URL liên dịch vụ (USER_SERVICE_URL, ORGANIZATION_SERVICE_URL, ...).
- WEBHOOK_SECRET cho cả phía gửi và nhận.

Khuyến nghị bảo mật:

- Không dùng giá trị mặc định secret ở production.
- Tách secret theo môi trường và quản lý bằng vault/secret manager.

## 14) Điểm lệch và kỹ thuật cần chú ý khi đặc tả

1. Tài liệu cũ trong repo có phần không còn khớp code hiện tại (đặc biệt về số lượng chat-service tách nhỏ).
2. Frontend service wrappers có một số endpoint legacy chưa khớp hoàn toàn với route backend mới.
3. Tồn tại file route/controller legacy song song (đuôi camelCase và dot.routes), cần chọn chuẩn duy nhất khi đặc tả.
4. Có hai hướng realtime: socket-service độc lập và socket trong chat-service.
5. root .env.example đang thiên về Next/Firebase, không phản ánh đầy đủ stack hiện tại.

## 15) Hướng dẫn viết đặc tả chuẩn từ README này

Khi bạn viết tài liệu đặc tả chính thức (SRS/SDD), nên đi theo trình tự:

1. Context hệ thống và actor.
2. Danh sách bounded context theo service.
3. Contract API (request/response/error) theo từng route.
4. Sequence diagram cho các luồng trọng tâm (auth, friend, task, message, permission check).
5. Data model và quy tắc toàn vẹn dữ liệu.
6. NFR: bảo mật, hiệu năng, logging, monitoring, DR.
7. Kế hoạch migration/cleanup cho phần legacy.

---

Nếu cần, có thể mở rộng README này thành bộ tài liệu hoàn chỉnh gồm:

- API Contract Catalog (OpenAPI theo từng service)
- Business Flow Spec (BPMN/sequence)
- Data Dictionary chuẩn hóa toàn hệ
- Permission Matrix theo role/resource/action
POST   /api/users/avatar            # Upload avatar
GET    /api/users/search?q=query    # Tìm kiếm users
GET    /api/users/:userId/status    # Lấy status (online/offline/away/busy)
PUT    /api/users/status            # Cập nhật status
```

**Database Collections:**
- `profiles` - User profiles, avatars, bio

---

### 4. Chat System Service (Port 4002)
**Mục đích:** Chat realtime và quản lý channels

**HTTP Endpoints:**
```
# Channels
GET    /api/chat/channels                          # Lấy danh sách channels
GET    /api/chat/channels/:id                      # Lấy channel detail
POST   /api/chat/channels                          # Tạo channel mới

# Messages
GET    /api/chat/channels/:id/messages             # Lấy messages
POST   /api/chat/channels/:id/messages             # Gửi message
PUT    /api/chat/messages/:id                      # Sửa message
DELETE /api/chat/messages/:id                      # Xóa message
POST   /api/chat/messages/:id/reactions            # Thêm reaction

# Direct Messages
GET    /api/chat/direct                            # Lấy DM conversations
POST   /api/chat/direct                            # Tạo DM mới

# Search
GET    /api/chat/search?q=query&channelId=xxx      # Tìm kiếm messages
```

**Socket.IO Events:**
```javascript
// Client → Server
'room:join'              // Join channel
'room:leave'             // Leave channel
'message:send'           // Gửi message
'message:typing'         // Đang gõ...

// Server → Client
'message:received'       // Nhận message mới
'message:updated'        // Message đã sửa
'message:deleted'        // Message đã xóa
'user:typing'            // User đang gõ
'users:online'           // Danh sách users online
'user:connected'         // User vào
'user:disconnected'      // User ra
```

**Database Collections:**
- `channels` - Chat channels
- `messages` - Chat messages
- `reactions` - Message reactions

---

### 5. Organization Service (Port 4003)
**Mục đích:** Quản lý organizations, departments, teams

**Endpoints:**
```
# Organizations
GET    /api/organizations/my                       # Lấy orgs của user
GET    /api/organizations/:id                      # Lấy org detail
POST   /api/organizations                          # Tạo org
PUT    /api/organizations/:id                      # Cập nhật org
DELETE /api/organizations/:id                      # Xóa org

# Departments
GET    /api/organizations/:orgId/departments       # Lấy departments
POST   /api/organizations/:orgId/departments       # Tạo department

# Teams
GET    /api/organizations/:orgId/departments/:deptId/teams   # Lấy teams
POST   /api/organizations/:orgId/departments/:deptId/teams   # Tạo team

# Members
GET    /api/organizations/:orgId/members           # Lấy members
POST   /api/organizations/:orgId/invite            # Mời member
PUT    /api/organizations/:orgId/members/:userId/role  # Cập nhật role
DELETE /api/organizations/:orgId/members/:userId   # Xóa member
```

**Database Collections:**
- `organizations`
- `departments`
- `teams`
- `memberships`

**Roles:**
- `owner` - Toàn quyền
- `admin` - Quản lý members, settings
- `member` - Thành viên thường
- `viewer` - Chỉ xem

---

### 6. Task Service (Port 4004)
**Mục đích:** Quản lý tasks và assignments

**Endpoints:**
```
GET    /api/tasks                   # Lấy tasks của user
POST   /api/tasks                   # Tạo task
GET    /api/tasks/:id               # Lấy task detail
PUT    /api/tasks/:id               # Cập nhật task
DELETE /api/tasks/:id               # Xóa task
POST   /api/tasks/:id/assign        # Assign task
POST   /api/tasks/:id/comments      # Thêm comment
PUT    /api/tasks/:id/status        # Cập nhật status
```

**Database Collections:**
- `tasks`
- `task_comments`
- `task_attachments`

**Task Status:**
- `todo` - Chưa làm
- `in_progress` - Đang làm
- `review` - Đang review
- `done` - Hoàn thành

**Priority:**
- `low`, `medium`, `high`, `urgent`

---

### 7. Friend Service (Port 4005)
**Mục đích:** Quản lý friends và social features

**Endpoints:**
```
GET    /api/friends                 # Lấy danh sách bạn
POST   /api/friends/request         # Gửi lời mời kết bạn
POST   /api/friends/accept/:id      # Chấp nhận lời mời
DELETE /api/friends/reject/:id      # Từ chối lời mời
DELETE /api/friends/:id             # Xóa bạn
GET    /api/friends/pending         # Lấy pending requests
POST   /api/friends/block           # Block user
DELETE /api/friends/unblock/:id     # Unblock user
```

**Database Collections:**
- `friendships`
- `friend_requests`
- `blocked_users`

---

## 🌐 API Endpoints Summary

### Authentication Endpoints
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Đăng ký | ❌ |
| POST | `/api/auth/login` | Đăng nhập | ❌ |
| POST | `/api/auth/logout` | Đăng xuất | ✅ |
| GET | `/api/auth/me` | Lấy user info | ✅ |
| POST | `/api/auth/forgot-password` | Quên mật khẩu | ❌ |
| POST | `/api/auth/reset-password` | Reset mật khẩu | ❌ |
| POST | `/api/auth/change-password` | Đổi mật khẩu | ✅ |

### User Endpoints
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/users/:id` | Lấy profile | ✅ |
| PUT | `/api/users/profile` | Cập nhật profile | ✅ |
| POST | `/api/users/avatar` | Upload avatar | ✅ |
| GET | `/api/users/search` | Tìm kiếm users | ✅ |

### Chat Endpoints
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/chat/channels` | Lấy channels | ✅ |
| POST | `/api/chat/channels` | Tạo channel | ✅ |
| GET | `/api/chat/channels/:id/messages` | Lấy messages | ✅ |
| POST | `/api/chat/channels/:id/messages` | Gửi message | ✅ |
| PUT | `/api/chat/messages/:id` | Sửa message | ✅ |
| DELETE | `/api/chat/messages/:id` | Xóa message | ✅ |

### Organization Endpoints
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/organizations/my` | Lấy orgs của user | ✅ |
| POST | `/api/organizations` | Tạo org | ✅ |
| GET | `/api/organizations/:id` | Lấy org detail | ✅ |
| PUT | `/api/organizations/:id` | Cập nhật org | ✅ |
| POST | `/api/organizations/:id/invite` | Mời member | ✅ |

### Task Endpoints
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/tasks` | Lấy tasks | ✅ |
| POST | `/api/tasks` | Tạo task | ✅ |
| PUT | `/api/tasks/:id` | Cập nhật task | ✅ |
| DELETE | `/api/tasks/:id` | Xóa task | ✅ |

### Friend Endpoints
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/friends` | Lấy danh sách bạn | ✅ |
| POST | `/api/friends/request` | Gửi lời mời | ✅ |
| POST | `/api/friends/accept/:id` | Chấp nhận | ✅ |
| DELETE | `/api/friends/:id` | Xóa bạn | ✅ |

---

## 🔄 Socket Events

### Connection Events
```javascript
// Connect to socket server
const socket = io('http://localhost:4002', {
  auth: { token: 'jwt-token' }
});

// Listen connection
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

### Room Events
```javascript
// Join room (channel)
socket.emit('room:join', { roomId: 'channel-123' });

// Leave room
socket.emit('room:leave', { roomId: 'channel-123' });
```

### Message Events
```javascript
// Send message
socket.emit('message:send', {
  roomId: 'channel-123',
  content: 'Hello!',
  attachments: []
});

// Receive message
socket.on('message:received', (message) => {
  console.log('New message:', message);
  // { id, userId, content, timestamp, ... }
});

// Message updated
socket.on('message:updated', (message) => {
  console.log('Message edited:', message);
});

// Message deleted
socket.on('message:deleted', (messageId) => {
  console.log('Message deleted:', messageId);
});
```

### Typing Events
```javascript
// User is typing
socket.emit('message:typing', { roomId: 'channel-123' });

// Listen typing
socket.on('user:typing', ({ userId, roomId }) => {
  console.log(`User ${userId} is typing in ${roomId}`);
});
```

### Online Users Events
```javascript
// Get online users
socket.on('users:online', (userIds) => {
  console.log('Online users:', userIds);
  // ['user1', 'user2', 'user3']
});

// User connected
socket.on('user:connected', (userId) => {
  console.log(`User ${userId} is now online`);
});

// User disconnected
socket.on('user:disconnected', (userId) => {
  console.log(`User ${userId} went offline`);
});
```

---

## 👥 Actors & Roles

### User Types

#### 1. **Guest** (Chưa đăng nhập)
- ✅ Xem trang home
- ✅ Đăng ký
- ✅ Đăng nhập
- ❌ Không truy cập features khác

#### 2. **Authenticated User** (Đã đăng nhập)
- ✅ Chat với friends
- ✅ Tham gia organizations
- ✅ Tạo/quản lý tasks
- ✅ Voice/Video calls
- ✅ Profile management

#### 3. **Organization Roles**

**Owner** (Chủ sở hữu)
- ✅ Toàn quyền với organization
- ✅ Delete organization
- ✅ Transfer ownership
- ✅ Manage all settings

**Admin** (Quản trị viên)
- ✅ Manage members
- ✅ Create/delete channels
- ✅ Manage departments
- ✅ Assign roles
- ❌ Cannot delete org

**Member** (Thành viên)
- ✅ Chat trong channels
- ✅ Tạo tasks
- ✅ View org info
- ❌ Cannot manage members

**Viewer** (Người xem)
- ✅ View only
- ❌ Cannot chat
- ❌ Cannot create tasks

### Permission Matrix

| Feature | Owner | Admin | Member | Viewer |
|---------|-------|-------|--------|--------|
| Delete Org | ✅ | ❌ | ❌ | ❌ |
| Manage Members | ✅ | ✅ | ❌ | ❌ |
| Create Channels | ✅ | ✅ | ❌ | ❌ |
| Send Messages | ✅ | ✅ | ✅ | ❌ |
| Create Tasks | ✅ | ✅ | ✅ | ❌ |
| View Channels | ✅ | ✅ | ✅ | ✅ |

---

## ⚙️ Cài Đặt & Chạy

### Prerequisites (Yêu Cầu)

- Node.js >= 18.0.0
- npm >= 9.0.0
- MongoDB >= 5.0
- Git

### 1. Clone Repository

```bash
git clone https://github.com/your-username/voice-chat-app.git
cd voice-chat-app
```

### 2. Install Dependencies

**Cách 1: Install tất cả (recommended)**
```bash
npm run install:all
```

**Cách 2: Install từng service**
```bash
# Root dependencies
npm install

# Frontend
cd client && npm install

# Backend services
cd services/api-gateway && npm install
cd services/auth-service && npm install
cd services/user-service && npm install
cd services/chat-system-service && npm install
cd services/organization-service && npm install
cd services/task-service && npm install
cd services/friend-service && npm install
```

### 3. Environment Variables

Tạo file `.env` trong mỗi service:

**client/.env**
```env
VITE_API_URL=http://localhost:8000/api
VITE_SOCKET_URL=http://localhost:4002
```

**services/auth-service/.env**
```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/voice-chat-auth
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRE=7d
NODE_ENV=development
```

**services/user-service/.env**
```env
PORT=4001
MONGODB_URI=mongodb://localhost:27017/voice-chat-users
```

**services/chat-system-service/.env**
```env
PORT=4002
MONGODB_URI=mongodb://localhost:27017/voice-chat-chat
```

**services/organization-service/.env**
```env
PORT=4003
MONGODB_URI=mongodb://localhost:27017/voice-chat-orgs
```

**services/task-service/.env**
```env
PORT=4004
MONGODB_URI=mongodb://localhost:27017/voice-chat-tasks
```

**services/friend-service/.env**
```env
PORT=4005
MONGODB_URI=mongodb://localhost:27017/voice-chat-friends
```

**services/api-gateway/.env**
```env
PORT=8000
AUTH_SERVICE_URL=http://localhost:4000
USER_SERVICE_URL=http://localhost:4001
CHAT_SERVICE_URL=http://localhost:4002
ORG_SERVICE_URL=http://localhost:4003
TASK_SERVICE_URL=http://localhost:4004
FRIEND_SERVICE_URL=http://localhost:4005
```

### 4. Start MongoDB

```bash
# Windows
mongod

# macOS/Linux
sudo systemctl start mongod
```

### 5. Run Application

**Option 1: Run All Services (recommended)**
```bash
npm run dev
```

Lệnh này sẽ chạy đồng thời:
- ✅ Client (Vite) → http://localhost:5173
- ✅ API Gateway → http://localhost:8000
- ✅ Auth Service → http://localhost:4000
- ✅ User Service → http://localhost:4001
- ✅ Chat Service → http://localhost:4002
- ✅ Organization Service → http://localhost:4003
- ✅ Task Service → http://localhost:4004
- ✅ Friend Service → http://localhost:4005

**Option 2: Run Separately**
```bash
# Terminal 1 - Frontend
npm run dev:client

# Terminal 2 - API Gateway
npm run dev:gateway

# Terminal 3 - All Backend Services
npm run dev:services
```

### 6. Access Application

- **Frontend**: http://localhost:5173
- **API Gateway**: http://localhost:8000
- **Socket.IO**: http://localhost:4002

### 7. Test API

```bash
# Health check
curl http://localhost:8000/health

# Register user
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

---

## 🐳 Docker Deployment

### Build & Run với Docker Compose

```bash
# Build all services
npm run docker:build

# Start all services
npm run docker:up

# Stop all services
npm run docker:down

# View logs
npm run docker:logs
```

### Docker Compose Services

```yaml
services:
  - mongodb          # Database
  - api-gateway      # Gateway (8000)
  - auth-service     # Auth (4000)
  - user-service     # User (4001)
  - chat-service     # Chat (4002)
  - org-service      # Organization (4003)
  - task-service     # Task (4004)
  - friend-service   # Friend (4005)
  - client           # Frontend (80)
```

---

## 📊 Database Schema

### Users Collection (Auth Service)
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  password: String (hashed),
  avatar: String (URL),
  role: String (default: 'user'),
  emailVerified: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Profiles Collection (User Service)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: Users),
  bio: String,
  location: String,
  website: String,
  phone: String,
  status: String (online/offline/away/busy),
  lastSeen: Date,
  preferences: {
    theme: String,
    language: String,
    notifications: Boolean
  }
}
```

### Channels Collection (Chat Service)
```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  type: String (text/voice/video),
  organizationId: ObjectId,
  createdBy: ObjectId,
  members: [ObjectId],
  settings: {
    isPrivate: Boolean,
    allowedRoles: [String]
  },
  createdAt: Date
}
```

### Messages Collection (Chat Service)
```javascript
{
  _id: ObjectId,
  channelId: ObjectId,
  userId: ObjectId,
  content: String,
  attachments: [{
    type: String,
    url: String,
    name: String,
    size: Number
  }],
  reactions: [{
    emoji: String,
    userId: ObjectId
  }],
  edited: Boolean,
  editedAt: Date,
  createdAt: Date
}
```

### Organizations Collection (Organization Service)
```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  logo: String,
  ownerId: ObjectId,
  settings: Object,
  createdAt: Date
}
```

### Departments Collection
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  name: String,
  description: String,
  managerId: ObjectId,
  createdAt: Date
}
```

### Teams Collection
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  departmentId: ObjectId,
  name: String,
  leaderId: ObjectId,
  members: [ObjectId],
  createdAt: Date
}
```

### Tasks Collection (Task Service)
```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  status: String (todo/in_progress/review/done),
  priority: String (low/medium/high/urgent),
  assignedTo: [ObjectId],
  createdBy: ObjectId,
  dueDate: Date,
  attachments: [Object],
  comments: [{
    userId: ObjectId,
    content: String,
    createdAt: Date
  }],
  createdAt: Date,
  updatedAt: Date
}
```

### Friendships Collection (Friend Service)
```javascript
{
  _id: ObjectId,
  userId1: ObjectId,
  userId2: ObjectId,
  status: String (pending/accepted),
  createdAt: Date
}
```

---

## 🔐 Authentication Flow

### Registration Flow
```
1. User fills registration form
   ↓
2. Frontend validates input
   ↓
3. POST /api/auth/register
   {
     name: "John Doe",
     email: "john@example.com",
     password: "password123"
   }
   ↓
4. Auth Service:
   - Validates email uniqueness
   - Hashes password (bcrypt)
   - Saves to database
   - Generates JWT token
   ↓
5. Response:
   {
     token: "jwt...",
     user: { id, name, email }
   }
   ↓
6. Frontend:
   - Saves token to localStorage
   - Redirects to dashboard
```

### Login Flow
```
1. User enters credentials
   ↓
2. POST /api/auth/login
   { email, password }
   ↓
3. Auth Service:
   - Finds user by email
   - Compares password (bcrypt.compare)
   - Generates JWT
   ↓
4. Response: { token, user }
   ↓
5. Frontend:
   - Saves token
   - Connects Socket.IO
   - Redirects to dashboard
```

### Protected Route Access
```
1. Frontend makes API request
   ↓
2. Axios Interceptor adds:
   Authorization: Bearer <token>
   ↓
3. API Gateway forwards to service
   ↓
4. Service middleware verifies JWT
   ↓
5. If valid → Process request
   If invalid → Return 401
```

---

## 🎨 Frontend Structure

### Context Hierarchy
```
<ThemeProvider>           ← Dark/Light mode
  <AuthProvider>          ← User authentication
    <SocketProvider>      ← Realtime connection
      <App />             ← Routes
    </SocketProvider>
  </AuthProvider>
</ThemeProvider>
```

### Routing
```javascript
<Routes>
  // Public Routes
  <Route path="/" element={<HomePage />} />
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />

  // Protected Routes
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/chat" element={<ChatPage />} />
  <Route path="/voice/:roomId" element={<VoiceRoomPage />} />
  <Route path="/tasks" element={<TasksPage />} />
  <Route path="/organizations" element={<OrganizationsPage />} />
  <Route path="/friends" element={<FriendsPage />} />
  
  // 404
  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

### State Management
- **React Context** - Global state (Auth, Socket, Theme)
- **useState** - Component local state
- **useEffect** - Side effects, API calls
- **useCallback** - Memoized callbacks
- **Custom Hooks** - Reusable logic (useAuth, useSocket)

### API Integration
```javascript
// services/api.js
const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  timeout: 30000
});

// Auto add token to requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors globally
api.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      // Auto logout & redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## 📝 Code Documentation

Tất cả các file core đã được comment chi tiết bằng tiếng Việt:

### ✅ Đã Comment Chi Tiết

**Entry Points:**
- `client/src/main.jsx` - Entry point, providers setup
- `client/src/App.jsx` - Routes, lazy loading

**Context Files:**
- `client/src/context/AuthContext.jsx` - Authentication logic
- `client/src/context/SocketContext.jsx` - Socket.IO management
- `client/src/context/ThemeContext.jsx` - Theme switching

**Service Files:**
- `client/src/services/api.js` - Axios instance, interceptors
- `client/src/services/authService.js` - Auth API calls
- `client/src/services/chatService.js` - Chat API calls
- `client/src/services/userService.js` - User API calls
- `client/src/services/organizationService.js` - Org API calls
- `client/src/services/friendService.js` - Friend API calls
- `client/src/services/taskService.js` - Task API calls

**Mỗi file có:**
- ✅ Comment header giải thích mục đích
- ✅ Comment từng function chi tiết
- ✅ Giải thích parameters và return values
- ✅ Examples cách sử dụng
- ✅ Luồng hoạt động (flow diagrams)
- ✅ Liên kết giữa các files

---

## 🐛 Troubleshooting

### Vấn Đề Thường Gặp

#### 1. MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**Giải pháp:**
```bash
# Check MongoDB running
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod

# Windows
net start MongoDB
```

#### 2. Port Already in Use
```
Error: listen EADDRINUSE :::4000
```

**Giải pháp:**
```bash
# Find process using port
lsof -i :4000

# Kill process
kill -9 <PID>

# Windows
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

#### 3. CORS Error
```
Access to XMLHttpRequest blocked by CORS policy
```

**Giải pháp:**
- Check API Gateway CORS configuration
- Verify `VITE_API_URL` in client/.env
- Ensure API Gateway is running

#### 4. Socket.IO Connection Failed
```
WebSocket connection failed
```

**Giải pháp:**
```javascript
// Check Socket URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
console.log('Socket URL:', SOCKET_URL);

// Verify chat-service is running on port 4002
```

#### 5. JWT Token Expired
```
Error: jwt expired
```

**Giải pháp:**
- Logout và login lại
- Implement token refresh mechanism
- Check JWT_EXPIRE in .env

#### 6. Module Not Found
```
Error: Cannot find module 'express'
```

**Giải pháp:**
```bash
# Reinstall dependencies
npm run install:all

# Or specific service
cd services/auth-service
npm install
```

### Debug Tips

**1. Check Service Health:**
```bash
# Auth Service
curl http://localhost:4000/health

# Chat Service
curl http://localhost:4002/health

# API Gateway
curl http://localhost:8000/health
```

**2. View Logs:**
```bash
# Frontend (Vite)
# Check browser console (F12)

# Backend services
# Check terminal where service is running

# Docker logs
docker-compose logs -f service-name
```

**3. Database Issues:**
```bash
# Connect to MongoDB
mongosh

# List databases
show dbs

# Use database
use voice-chat-auth

# List collections
show collections

# Query users
db.users.find()
```

**4. Clear Cache:**
```bash
# Clear npm cache
npm cache clean --force

# Clear node_modules
rm -rf node_modules package-lock.json
npm install

# Clear browser cache
# Ctrl+Shift+Delete
```

---

## 🚀 Performance Optimization

### Frontend Optimizations
- ✅ **Lazy Loading** - Code splitting per route
- ✅ **Image Optimization** - WebP format, lazy load images
- ✅ **Bundle Size** - Tree shaking, minimize dependencies
- ✅ **Caching** - Service workers, cache API responses
- ✅ **Memoization** - React.memo, useMemo, useCallback

### Backend Optimizations
- ✅ **Database Indexing** - Index frequently queried fields
- ✅ **Query Optimization** - Use projections, limit results
- ✅ **Caching** - Redis for session/frequently accessed data
- ✅ **Connection Pooling** - Reuse database connections
- ✅ **Load Balancing** - Distribute requests across instances

### Measurements
- Initial Bundle Size: ~150KB (với lazy loading)
- Time to Interactive: ~0.6s
- API Response Time: <100ms (local)
- Socket Latency: <50ms (local)

---

## 🤝 Contributing

Contributions are welcome! Follow these steps:

1. **Fork the repository**
   ```bash
   gh repo fork your-username/voice-chat-app
   ```

2. **Create feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Commit changes**
   ```bash
   git commit -m "Add amazing feature"
   ```

4. **Push to branch**
   ```bash
   git push origin feature/amazing-feature
   ```

5. **Open Pull Request**

### Coding Standards
- Use ESLint + Prettier
- Write meaningful commit messages
- Add comments for complex logic
- Follow existing code style
- Write tests for new features

---

## 🧠 Hướng Dẫn Phân Tích Và Đặc Tả

Section này giúp người mới vào dự án có thể hiểu nhanh toàn bộ hệ thống để viết:
1. SRS (Software Requirements Specification)
2. Use Case Specification
3. Sequence Diagram
4. Activity Diagram
5. Domain Model
6. NFR và test scenarios

### 1. Mục tiêu nghiệp vụ của hệ thống

VoiceHub giải quyết bài toán giao tiếp và cộng tác nội bộ doanh nghiệp theo mô hình tổ chức nhiều tầng.

Năng lực cốt lõi:
1. Xác thực và quản lý danh tính người dùng.
2. Giao tiếp realtime (chat trực tiếp, chat theo ngữ cảnh tổ chức).
3. Điều phối tổ chức, server, role, permission.
4. Quản lý công việc, tài liệu, thông báo, họp.
5. Mở rộng event-driven qua webhook cho tích hợp chéo service.

### 2. Ranh giới hệ thống (System Boundary)

Trong phạm vi:
1. Frontend web client.
2. Gateway và các microservices nghiệp vụ.
3. Socket realtime channel.
4. Data stores MongoDB + Redis.
5. Tích hợp tài liệu qua S3.

Ngoài phạm vi trực tiếp (nhưng có thể tích hợp):
1. Mobile native app.
2. BI dashboard enterprise-level tách riêng.
3. Event streaming platform ở quy mô lớn (Kafka/Pulsar).

### 3. Actor catalogue (đầu vào cho Use Case)

Actor chính:
1. Guest
2. Authenticated User
3. Organization Owner
4. Organization Admin
5. Organization Member
6. Organization Viewer
7. System Integrator (dịch vụ ngoài gọi webhook)

Mỗi actor có thể map sang permission matrix ở gateway để viết use case theo quyền.

### 4. Use case catalogue gợi ý

Nhóm Identity:
1. UC-01: Đăng ký tài khoản
2. UC-02: Đăng nhập
3. UC-03: Làm mới token
4. UC-04: Quên/đặt lại mật khẩu
5. UC-05: Đăng xuất

Nhóm User Profile:
1. UC-10: Xem/cập nhật hồ sơ cá nhân
2. UC-11: Tìm kiếm người dùng

Nhóm Organization & RBAC:
1. UC-20: Tạo organization
2. UC-21: Tạo server trong organization
3. UC-22: Thêm/xóa thành viên server
4. UC-23: Gán role cho thành viên
5. UC-24: Kiểm tra quyền truy cập tài nguyên

Nhóm Chat & Realtime:
1. UC-30: Gửi tin nhắn trực tiếp bạn bè
2. UC-31: Nhận tin nhắn realtime
3. UC-32: Đánh dấu đã đọc

Nhóm Task/Document/Voice:
1. UC-40: Tạo và cập nhật task
2. UC-41: Upload tài liệu và versioning
3. UC-42: Tạo và điều phối meeting

Nhóm Notification/Webhook:
1. UC-50: Tạo notification đơn/bulk
2. UC-51: Đánh dấu đã đọc toàn bộ
3. UC-52: Xử lý webhook event theo domain

### 5. Template viết Use Case Specification

Mẫu tối thiểu:
1. Use Case ID
2. Tên use case
3. Actor chính
4. Mục tiêu
5. Tiền điều kiện
6. Hậu điều kiện
7. Main flow
8. Alternative flow
9. Exception flow
10. Business rules liên quan
11. API endpoints liên quan
12. Data entities liên quan

### 6. Sequence diagram blueprint theo luồng chính

#### 6.1 Login + protected API

Thành phần tham gia:
1. Browser Client
2. API Gateway
3. Auth Service
4. Target Business Service

Thứ tự thông điệp:
1. Client -> Gateway: POST /api/auth/login
2. Gateway -> Auth: forward login
3. Auth -> Gateway: access/refresh token
4. Gateway -> Client: token payload
5. Client -> Gateway: protected request kèm Bearer token
6. Gateway: auth middleware verify JWT
7. Gateway: permission middleware check action
8. Gateway -> Service: proxy request
9. Service -> Gateway -> Client: response

#### 6.2 Friend direct message realtime

Thành phần tham gia:
1. Sender Client
2. Socket Service
3. Chat Service
4. Receiver Client

Thứ tự thông điệp:
1. Sender connect namespace /chat với token
2. Socket auth thành công, join room user:<id>
3. Sender emit friend:send
4. Socket -> Chat Service: persist message
5. Socket -> Receiver room: friend:new_message
6. Socket -> Sender: friend:sent

### 7. Activity diagram blueprint

Activity cho quy trình tạo task:
1. User mở form task
2. Nhập dữ liệu bắt buộc
3. Frontend validate
4. Gọi API qua gateway
5. Gateway auth + permission
6. Task service validate domain rules
7. Persist MongoDB
8. (Optional) phát webhook/notification
9. Trả kết quả cho UI

Điểm decision node điển hình:
1. Token hợp lệ?
2. User có quyền task:write?
3. Dữ liệu hợp lệ?
4. Có cần phát thông báo không?

### 8. Yêu cầu chức năng (FR) và phi chức năng (NFR)

FR gợi ý:
1. Hệ thống phải cho phép đăng ký/đăng nhập bằng email/password.
2. Hệ thống phải hỗ trợ realtime direct messaging.
3. Hệ thống phải kiểm soát truy cập theo role/permission.
4. Hệ thống phải lưu lịch sử chat/task/document.
5. Hệ thống phải hỗ trợ webhook event theo domain.

NFR gợi ý:
1. Availability: gateway và core services có health endpoint.
2. Security: JWT verify, webhook secret verify, không hard-code secret production.
3. Performance: response API phổ biến dưới ngưỡng mục tiêu nội bộ.
4. Scalability: service độc lập, mở rộng ngang qua container orchestration.
5. Observability: log theo service và theo request context.

### 9. Business rules cốt lõi

1. Tất cả protected route phải qua auth middleware ở gateway.
2. Route cần quyền phải qua permission middleware và action mapping.
3. DM qua /api/messages có nhánh cho chat bạn bè không bắt buộc serverId.
4. Socket handshake phải có token hợp lệ trước khi subscribe room user.
5. JWT_SECRET cần đồng bộ các thành phần verify token.

### 10. Dữ liệu đầu vào cho SRS và phân tích yêu cầu

Nguồn thu thập yêu cầu từ codebase:
1. Route definitions trong services/*/src/routes/*.routes.js
2. Controller logic trong services/*/src/controllers/*
3. Schema trong services/*/src/models/*
4. Policy tại api-gateway/src/config/permissions.js
5. Realtime contract tại services/socket-service/src/socket/chat.namespace.js
6. Frontend behavior tại client/src/context/AuthContext.jsx và SocketContext.jsx

### 11. Checklist để người mới hiểu toàn bộ dự án

Ngày đầu onboarding:
1. Đọc README phần tổng quan + phụ lục cập nhật.
2. Chạy docker compose và verify health endpoints.
3. Chạy frontend local và test login.
4. Test luồng DM realtime với 2 tài khoản.
5. Đọc gateway mapping + permission matrix.

Ngày thứ hai:
1. Chọn 1 use case và trace full stack frontend -> gateway -> service -> DB.
2. Viết sequence diagram cho use case đó.
3. Viết test scenarios happy path + alternative path + exception path.

### 12. Khung test scenario cho phân tích chất lượng

Mẫu scenario:
1. Scenario ID
2. Precondition
3. Input
4. Steps
5. Expected result
6. Observed result
7. Log/API evidence

Nhóm scenario bắt buộc:
1. Auth success/fail/expired token.
2. Permission allow/deny theo role.
3. Socket connect/disconnect/reconnect/error.
4. CRUD task/document/notification.
5. Webhook valid/invalid secret.

### 13. Gợi ý chuẩn hóa tài liệu tiếp theo

1. Tạo SRS theo module (Auth, Organization, Chat, Task, Document, Notification).
2. Tạo API contract chuẩn OpenAPI cho từng service.
3. Tạo sơ đồ C4 (Context, Container, Component) cho kiến trúc.
4. Tạo traceability matrix: Requirement -> Use Case -> API -> Test case.

---

## 🧩 Phụ Lục Cập Nhật Theo Mã Nguồn Hiện Tại

Phần này được bổ sung để đồng bộ README với code thực tế đang chạy trong repository hiện tại. Nội dung cũ ở trên vẫn được giữ nguyên để tham khảo lịch sử/tầm nhìn sản phẩm, còn phụ lục này là nguồn tham chiếu kỹ thuật ưu tiên khi triển khai và vận hành.

### A. Kiến trúc runtime thực tế

Thành phần đang chạy:
1. Frontend React/Vite (client)
2. API Gateway Node/Express
3. Nhóm microservices Node.js
4. Webhook Service Python/FastAPI
5. MongoDB + Redis

Giao thức:
1. HTTP REST qua API Gateway
2. Realtime Socket.IO qua socket-service namespace /chat
3. Event webhook nội bộ qua webhook-service

### B. Service map chuẩn (đúng theo docker-compose và source)

| Service | Port | Vai trò |
|---|---:|---|
| api-gateway | 3000 | Gateway + auth + permission + proxy |
| auth-service | 3001 | Đăng ký/đăng nhập/JWT/refresh |
| notification-service | 3003 | Notification API |
| user-service | 3004 | User profile |
| voice-service | 3005 | Meetings/voice |
| chat-service | 3006 | Message REST |
| task-service | 3009 | Task/work |
| document-service | 3010 | Documents + S3 integration |
| organization-service | 3013 | Organization + servers |
| friend-service | 3014 | Friend/social |
| role-permission-service | 3015 | RBAC role/permission |
| webhook-service | 3016 | Webhook intake (FastAPI) |
| socket-service | 3017 | Realtime Socket.IO |
| mongodb | 27017 | Data store |
| redis | 6379 | Cache/session |

### C. API Gateway mapping chuẩn

Gateway định tuyến theo prefix:
1. /api/auth -> auth-service
2. /api/users -> user-service
3. /api/friends -> friend-service
4. /api/organizations, /api/servers -> organization-service
5. /api/roles, /api/permissions -> role-permission-service
6. /api/messages, /api/chat -> chat-service
7. /api/voice, /api/meetings -> voice-service
8. /api/tasks, /api/work -> task-service
9. /api/documents -> document-service
10. /api/notifications -> notification-service

Public route không bắt JWT:
1. /api/auth/register
2. /api/auth/login
3. /api/auth/refresh-token
4. /api/auth/forgot-password
5. /api/auth/reset-password
6. /api/auth/verify-email
7. /health

### D. Socket-service (bổ sung chuyên sâu)

Socket-service là kênh realtime tách riêng khỏi chat-service REST.

Entrypoint:
1. services/socket-service/src/server.js
2. services/socket-service/src/socket/chat.namespace.js

Namespace đang dùng:
1. /chat

Event vào từ client:
1. friend:send { receiverId, content, messageType }

Event ra từ server:
1. friend:new_message
2. friend:sent
3. error

Luồng hoạt động DM:
1. Client kết nối /chat với JWT trong handshake.auth
2. socketAuth xác thực token và gắn socket.user
3. Socket join room user:<userId>
4. friend:send gọi chat-service POST /api/messages để persist
5. Emit friend:new_message tới room user:<receiverId>
6. Emit friend:sent về sender

Checklist khi lỗi socket:
1. Kiểm tra http://localhost:3017/health
2. Frontend phải dùng VITE_SOCKET_URL=http://localhost:3017
3. JWT_SECRET phải đồng bộ giữa auth-service, api-gateway, socket-service
4. Chat-service phải Up vì socket-service forward dữ liệu qua HTTP

### E. Tầng kỹ thuật từ ngoài vào trong

1. Presentation Layer: client/src/pages, client/src/components, client/src/context
2. API Access Layer: client/src/services/api.js và các service API client
3. Gateway Layer: api-gateway/src/* (auth, permission, proxy)
4. Domain Service Layer: services/*/src (app, routes, controllers, models)
5. Shared Foundation Layer: shared/config, shared/middleware, shared/utils
6. Data/Integration Layer: MongoDB, Redis, S3, Webhook

### F. Luồng nghiệp vụ chính

Luồng đăng nhập:
1. Client gọi /api/auth/login
2. Gateway bypass permission cho public route
3. Auth-service phát access/refresh token
4. Client lưu token
5. Request sau đó đính kèm Bearer token

Luồng phân quyền:
1. Gateway auth middleware verify JWT
2. permission middleware map action theo method+path
3. Trích serverId/organizationId từ request
4. Gọi role-permission-service để check quyền
5. Nếu allowed mới proxy tới service đích

Luồng webhook:
1. Service gửi event nội bộ tới webhook-service
2. Webhook xác thực x_webhook_secret
3. Điều phối tới handler tương ứng
4. Handler có thể gọi notification-service

### G. Endpoint inventory rút gọn theo service

1. Auth: /api/auth/register, /login, /refresh-token, /forgot-password, /reset-password, /verify-email, /logout, /change-password, /me
2. User: /api/users, /api/users/me, /api/users/search, /api/users/:userId
3. Chat: /api/messages, /api/messages/:messageId, /api/messages/:messageId/read
4. Organization: /api/organizations/* và /api/servers/*
5. Task: /api/tasks/* và alias /api/work
6. Voice: /api/meetings/* và alias /api/voice
7. Friend: /api/friends/search, /request, /:friendId/accept, /:friendId/reject, /requests, /relationship
8. Notification: /api/notifications, /bulk, /read-all
9. Role/Permission: /api/roles/*, /api/permissions/check
10. Document: /api/documents/*, /:documentId/versions
11. Webhook: /webhook/friend, /task, /meeting, /document, /chat, /role, /organization

### H. Data model lõi theo bounded context

1. Auth: UserAuth
2. User: UserProfile
3. Chat: Message
4. Organization: Organization, Server, Membership, Department, Team
5. Task: Task
6. Voice: Meeting
7. Friend: Friend, Friendship
8. Notification: Notification
9. Document: Document
10. RBAC: Role, UserRole

### I. Cách chạy chuẩn hiện tại

Backend stack (dev có hot reload):
1. `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`
2. `docker compose ps`
3. Health gateway: http://localhost:3000/health

Xem `docs/DOCKER-COMPOSE.md` nếu cần chỉ chạy Mongo/Redis hoặc dùng `docker compose up` without dev.

Frontend:
1. cd client
2. npm install
3. npm run dev -- --host 0.0.0.0 --port 5173

Biến frontend khuyến nghị:
1. VITE_API_URL=http://localhost:3000/api
2. VITE_SOCKET_URL=http://localhost:3017

### J. Ghi chú vận hành quan trọng

1. REDIS_HOST trong container nên là redis, không dùng localhost.
2. JWT_SECRET phải đồng bộ ít nhất giữa auth-service và api-gateway; nếu dùng socket auth thì đồng bộ thêm socket-service.
3. Dự án đang có cả ENV.example và .env.example, cần chuẩn hóa khi onboarding team để tránh thiếu file env.
4. Một số file route/controller legacy còn tồn tại; luôn kiểm tra app.js để biết route đang mount thực tế.

### K. Big Data readiness (định hướng hệ thống thông tin)

Hệ thống hiện tại phù hợp workload giao dịch thời gian thực. Để mở rộng phân tích dữ liệu lớn:
1. Chuẩn hóa event schema từ các service (chat/task/meeting/document).
2. Đưa event bus (Kafka/Pulsar) thay cho webhook point-to-point ở scale lớn.
3. Tách pipeline OLTP và OLAP để dashboard phân tích không ảnh hưởng API giao dịch.
4. Thiết kế data lake + warehouse + semantic metrics layer cho BI.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📞 Contact & Support

- **Email**: your-email@example.com
- **Issues**: [GitHub Issues](https://github.com/your-username/voice-chat-app/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/voice-chat-app/discussions)

---

## 🙏 Acknowledgments

- [React](https://reactjs.org/) - UI Library
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Socket.IO](https://socket.io/) - Realtime engine
- [Express.js](https://expressjs.com/) - Backend framework
- [MongoDB](https://www.mongodb.com/) - Database
- [Vite](https://vitejs.dev/) - Build tool

---

<div align="center">

### ⭐ Star this repo if you find it helpful!

Made with ❤️ by Your Team

</div>
