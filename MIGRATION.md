# Hướng dẫn Migration và Phát triển

## Cấu trúc mới vs Cấu trúc cũ

### Cấu trúc cũ
```
services/
  └── chat-service/  (Port 3002) - Service chat đơn lẻ
```

### Cấu trúc mới (Microservices)
```
services/
  ├── chat-system-service/   (Port 3006) - Hệ thống chat
  ├── chat-room-service/      (Port 3007) - Phòng chat
  └── chat-user-service/      (Port 3008) - Người dùng chat
```

## Các Service mới được thêm

1. **chat-system-service** - Quản lý hệ thống chat tổng thể
2. **chat-room-service** - Quản lý phòng chat và thành viên
3. **chat-user-service** - Quản lý người dùng chat
4. **work-management-service** - Quản lý công việc (MongoDB)
5. **document-service** - Quản lý tài liệu (AWS S3)
6. **ai-agent-service** - AI Agent và tự động hóa
7. **progress-tracking-service** - Theo dõi tiến độ
8. **organization-service** - Quản lý tổ chức

## Bước tiếp theo để phát triển

### 1. Chat System Service

**Models cần tạo:**
- `Chat.js` - Model cho chat conversation
- `Message.js` - Model cho tin nhắn
- `ChatParticipant.js` - Model cho người tham gia

**Controllers cần tạo:**
- `ChatController.js` - Xử lý CRUD chat
- `MessageController.js` - Xử lý tin nhắn

**Services cần tạo:**
- `chatService.js` - Logic nghiệp vụ chat
- `messageService.js` - Logic xử lý tin nhắn
- `socketService.js` - WebSocket handling

### 2. Chat Room Service

**Models cần tạo:**
- `Room.js` - Model cho phòng chat
- `RoomMember.js` - Model cho thành viên phòng
- `RoomPermission.js` - Model cho phân quyền

**Controllers cần tạo:**
- `RoomController.js` - CRUD phòng chat
- `MemberController.js` - Quản lý thành viên

**Services cần tạo:**
- `roomService.js` - Logic quản lý phòng
- `memberService.js` - Logic quản lý thành viên
- `permissionService.js` - Logic phân quyền

### 3. Chat User Service

**Models cần tạo:**
- `ChatUser.js` - Model người dùng chat
- `UserStatus.js` - Model trạng thái online/offline
- `UserPreference.js` - Model preferences

**Controllers cần tạo:**
- `ChatUserController.js` - Quản lý người dùng
- `StatusController.js` - Quản lý trạng thái

**Services cần tạo:**
- `userStatusService.js` - Logic trạng thái
- `presenceService.js` - Logic presence

### 4. Work Management Service

**Models cần tạo:**
- `Task.js` - Model nhiệm vụ
- `WorkItem.js` - Model đầu việc
- `Timeline.js` - Model timeline
- `TaskStatus.js` - Model trạng thái

**Controllers cần tạo:**
- `TaskController.js` - CRUD nhiệm vụ
- `WorkItemController.js` - CRUD đầu việc

**Services cần tạo:**
- `taskService.js` - Logic nhiệm vụ
- `workItemService.js` - Logic đầu việc
- `statusService.js` - Logic trạng thái

### 5. Document Service

**Models cần tạo:**
- `Document.js` - Model tài liệu (metadata)
- `DocumentVersion.js` - Model phiên bản

**Controllers cần tạo:**
- `DocumentController.js` - CRUD tài liệu
- `UploadController.js` - Upload tài liệu

**Services cần tạo:**
- `s3Service.js` - Tích hợp AWS S3
- `documentService.js` - Logic tài liệu
- `versionService.js` - Logic version control

### 6. AI Agent Service

**Services cần tạo:**
- `summarizationService.js` - Tóm tắt cuộc họp/chat
- `taskExtractionService.js` - Trích xuất đầu việc
- `reminderService.js` - Nhắc nhở công việc
- `knowledgeService.js` - Truy xuất tri thức

**Controllers cần tạo:**
- `AIAgentController.js` - API cho AI agent

### 7. Progress Tracking Service

**Models cần tạo:**
- `Progress.js` - Model tiến độ
- `Analytics.js` - Model phân tích
- `Bottleneck.js` - Model điểm nghẽn

**Services cần tạo:**
- `progressService.js` - Logic theo dõi tiến độ
- `analyticsService.js` - Logic phân tích
- `bottleneckService.js` - Logic phát hiện điểm nghẽn

### 8. Organization Service

**Models cần tạo:**
- `Organization.js` - Model tổ chức
- `Department.js` - Model phòng ban
- `Team.js` - Model nhóm
- `Role.js` - Model vai trò

**Controllers cần tạo:**
- `OrganizationController.js` - CRUD tổ chức
- `DepartmentController.js` - CRUD phòng ban
- `TeamController.js` - CRUD nhóm

## Kết nối giữa các Services

### Service Dependencies

```
chat-system-service
  ├── chat-room-service
  └── chat-user-service

chat-room-service
  └── organization-service

chat-user-service
  └── user-service

work-management-service
  └── organization-service

progress-tracking-service
  ├── chat-system-service
  ├── work-management-service
  └── document-service

ai-agent-service
  ├── chat-system-service
  ├── work-management-service
  └── document-service
```

### Inter-service Communication

Sử dụng HTTP requests hoặc message queue (RabbitMQ/Kafka) cho:
- Tạo công việc từ chat
- Cập nhật tiến độ từ documents
- AI agent phân tích dữ liệu

## Database Collections

### MongoDB Collections

- `enterprise_chat_system` - Chat system data
- `enterprise_chat_rooms` - Chat rooms
- `enterprise_chat_users` - Chat users
- `enterprise_work` - Work management
- `enterprise_progress` - Progress tracking
- `enterprise_documents` - Document metadata
- `enterprise_organization` - Organization structure

## Testing Strategy

1. **Unit Tests**: Test từng service độc lập
2. **Integration Tests**: Test tương tác giữa services
3. **E2E Tests**: Test toàn bộ flow

## Deployment

### Development
```bash
docker-compose up -d
```

### Production
- Sử dụng Kubernetes
- Service discovery với Consul/Eureka
- Load balancing với Nginx/HAProxy
- Monitoring với Prometheus + Grafana

## Lưu ý

- Service `chat-service` cũ vẫn tồn tại, có thể migrate code từ đó sang các service mới
- Mỗi service nên có health check endpoint: `GET /health`
- Sử dụng shared middleware từ `shared/middleware/` cho authentication
- Cấu hình database từ `shared/config/`

