# 01 - SYSTEM SPEC

## 1. Tong quan he thong

VoiceHub la nen tang giao tiep noi bo theo kien truc microservices, gom cac module nghiep vu:

- Dinh danh va xac thuc nguoi dung
- Ho so nguoi dung
- Ban be va giao tiep truc tiep
- To chuc va khong gian lam viec (organization/server)
- Phan quyen RBAC theo server
- Chat, voice meeting
- Quan ly cong viec
- Quan ly tai lieu
- Notification
- Webhook event bus noi bo
- Realtime socket

## 2. Kien truc lop (outside-in)

Lop 1 - Presentation:
- React Client

Lop 2 - Edge:
- API Gateway (xac thuc, kiem quyen, proxy)

Lop 3 - Domain services:
- auth, user, friend, organization, role-permission, chat, voice, task, document, notification

Lop 4 - Integration services:
- webhook-service (Python)
- socket-service (Realtime)

Lop 5 - Data:
- MongoDB Atlas (moi service 1 DB logic)
- Redis cache

## 3. Topology va cong ket noi

- Client -> API Gateway: HTTP/JSON
- Client -> Socket Service: Socket.IO namespace /chat
- Gateway -> Domain services: HTTP
- Domain service -> Domain service: HTTP noi bo
- Domain service -> Webhook service: HTTP webhook voi X-Webhook-Secret
- Webhook service -> Notification service: HTTP
- Services -> MongoDB/Redis: data + cache

## 4. Cac thanh phan va port

| Thanh phan | Port | Vai tro |
|---|---:|---|
| api-gateway | 3000 | Cua vao duy nhat cho REST |
| auth-service | 3001 | Dang ky, login, JWT, verify email |
| notification-service | 3003 | Notification feed |
| user-service | 3004 | Profile, status |
| voice-service | 3005 | Meeting va participant |
| chat-service | 3006 | Message DM/room + socket noi bo |
| task-service | 3009 | Task lifecycle |
| document-service | 3010 | Document metadata/version |
| organization-service | 3013 | Organization + server + member |
| friend-service | 3014 | Friend request/accept/block |
| role-permission-service | 3015 | Role, UserRole, check permission |
| webhook-service | 3016 | Event webhook dispatcher |
| socket-service | 3017 | Realtime Socket.IO doc lap |

## 5. API Gateway - behavior chuan

### 5.1 Xac thuc

- Public routes: register/login/refresh/forgot/reset/verify-email/health
- Route con lai: bat buoc Bearer JWT
- JWT duoc verify tai gateway

### 5.2 Kiem tra quyen

- Gateway map METHOD + PATH thanh action, vi du: task:write
- Gateway extract context serverId/organizationId
- Gateway goi role-permission-service de check
- Neu denied -> 403
- Neu allowed -> proxy den service dich

### 5.3 Proxy

- Route theo prefix: /api/auth, /api/users, ...
- Forward header nguoi dung (x-user-id, x-user-email)
- Xu ly timeout/service unavailable

## 6. Danh sach route map Gateway -> service

- /api/auth -> auth-service
- /api/users -> user-service
- /api/friends -> friend-service
- /api/organizations, /api/servers -> organization-service
- /api/roles, /api/permissions -> role-permission-service
- /api/messages, /api/chat -> chat-service
- /api/voice, /api/meetings -> voice-service
- /api/tasks, /api/work -> task-service
- /api/documents -> document-service
- /api/notifications -> notification-service

## 7. Data architecture

### 7.1 MongoDB

Moi service su dung schema rieng, principal entities:

- UserAuth
- UserProfile
- Friend
- Organization, Server, Membership
- Role, UserRole
- Message
- Meeting
- Task
- Document
- Notification

### 7.2 Redis

Muc dich chinh:

- Cache permissions theo user-server
- Cache danh sach ban be
- Cache vai tro/tai nguyen nong

## 8. Security architecture

- JWT cho auth HTTP va socket auth
- X-Webhook-Secret cho webhook inbound
- Permission check theo action-level
- Co fallback secret trong code (can loai bo khi production)

## 9. Realtime architecture

Co 2 huong realtime ton tai song song:

1. chat-service co socket noi bo
2. socket-service doc lap (namespace /chat), forward friend:send sang chat-service de luu DB

Khuyen nghi dac ta:
- Chon 1 huong canonical cho ban release chinh
- Ghi ro huong con lai la legacy/transition

## 10. Kha nang mo rong va gioi han

Strengths:
- Tach domain service ro rang
- Gateway gom auth + permission tap trung
- Event webhook giam coupling

Limitations:
- Tai lieu cu co phan lech code
- Endpoint frontend wrappers co phan legacy
- Song song 2 realtime channel
- Chua thay ratelimit nghiem ngat tai gateway

## 11. Environment va deployment

Local dev:
- Docker Compose run full stack
- Client Vite at 5173

Production note:
- Bat buoc rotate secret
- Quan ly env qua secret manager
- Bo sung observability (trace/log/metrics) theo service
