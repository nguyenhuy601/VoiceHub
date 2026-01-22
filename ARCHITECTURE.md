# Kiến trúc hệ thống - Nền tảng giao tiếp nội bộ doanh nghiệp

## Tổng quan kiến trúc

Hệ thống được thiết kế theo mô hình **Microservices Architecture** với các service độc lập, có thể scale riêng biệt.

## Cấu trúc Microservices

### 1. **API Gateway** (`api-gateway/`)
- Điểm vào duy nhất của hệ thống
- Xử lý routing, authentication, rate limiting
- Load balancing giữa các services

### 2. **Chat Services**

#### 2.1. **Chat System Service** (`services/chat-system-service/`)
- Quản lý hệ thống chat tổng thể
- Xử lý logic nghiệp vụ chat
- Quản lý kết nối và phiên chat

#### 2.2. **Chat Room Service** (`services/chat-room-service/`)
- Quản lý các phòng chat
- Tạo, xóa, cập nhật phòng chat
- Quản lý thành viên trong phòng
- Phân quyền theo cơ cấu tổ chức

#### 2.3. **Chat User Service** (`services/chat-user-service/`)
- Quản lý người dùng chat
- Xử lý trạng thái online/offline
- Quản lý profile và preferences
- Tích hợp với organization service

### 3. **Core Services**

#### 3.1. **Auth Service** (`services/auth-service/`)
- Xác thực và phân quyền
- JWT token management
- Role-based access control (RBAC)

#### 3.2. **User Service** (`services/user-service/`)
- Quản lý thông tin người dùng
- Profile management
- User preferences

#### 3.3. **Organization Service** (`services/organization-service/`)
- Quản lý cơ cấu tổ chức doanh nghiệp
- Phòng ban, nhóm, vai trò
- Phân quyền theo tổ chức

### 4. **Work Management Services**

#### 4.1. **Work Management Service** (`services/work-management-service/`)
- Quản lý nhiệm vụ và đầu việc
- Trạng thái thực hiện
- Mốc thời gian và deadline
- **Database**: MongoDB

#### 4.2. **Progress Tracking Service** (`services/progress-tracking-service/`)
- Theo dõi tiến độ công việc
- Phân tích dữ liệu từ chat, documents, meetings
- Báo cáo tiến độ theo nhóm/phòng ban
- Phát hiện điểm nghẽn

### 5. **Document Services**

#### 5.1. **Document Service** (`services/document-service/`)
- Quản lý tài liệu làm việc
- Upload, download, version control
- **Storage**: AWS S3
- Liên kết tài liệu với công việc

### 6. **AI & Intelligence Services**

#### 6.1. **AI Agent Service** (`services/ai-agent-service/`)
- Tổng hợp và chuẩn hóa thông tin
- Tóm tắt cuộc họp và chat
- Xác định đầu việc từ trao đổi
- Nhắc nhở và cảnh báo công việc
- Truy xuất tri thức nội bộ

### 7. **Communication Services**

#### 7.1. **Voice Service** (`services/voice-service/`)
- Quản lý cuộc họp voice/video
- WebRTC signaling
- Recording và transcription

#### 7.2. **Notification Service** (`services/notification-service/`)
- Gửi thông báo real-time
- Email notifications
- Push notifications

### 8. **Shared Resources** (`shared/`)
- Common utilities
- Shared models/types
- Middleware
- Database configurations
- Logger

### 9. **Client** (`client/`)
- Frontend application (React)
- WebSocket client
- UI/UX components

## Data Flow

```
Client → API Gateway → [Microservices]
                           ↓
                    MongoDB (Work Data)
                    AWS S3 (Documents)
                    Redis (Caching/Queue)
```

## Communication Patterns

- **Synchronous**: REST API, GraphQL
- **Asynchronous**: Message Queue (RabbitMQ/Kafka), WebSocket
- **Service Discovery**: Consul/Eureka
- **API Gateway**: Centralized routing

## Database Strategy

- **MongoDB**: Work data, chat messages, user data
- **AWS S3**: Document storage
- **Redis**: Caching, session management, real-time data

## Deployment

- **Containerization**: Docker
- **Orchestration**: Docker Compose (dev), Kubernetes (prod)
- **CI/CD**: Automated deployment pipeline

