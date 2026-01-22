# Cấu trúc thư mục chi tiết

## Tổng quan

Hệ thống được tổ chức theo kiến trúc Microservices với các service độc lập, mỗi service có thể scale riêng biệt.

## Cấu trúc thư mục đầy đủ

```
VoiceChat-app/
│
├── 📁 api-gateway/                    # API Gateway - Entry point
│   ├── src/
│   │   ├── app.js                     # Express app
│   │   ├── server.js                  # Server entry
│   │   ├── middleware/                # Gateway middleware
│   │   ├── proxy/                     # Service proxy configs
│   │   └── routes/                    # Gateway routes
│   ├── Dockerfile
│   └── package.json
│
├── 📁 client/                          # Frontend (React)
│   ├── src/
│   │   ├── components/                 # React components
│   │   ├── pages/                     # Page components
│   │   ├── services/                  # API services
│   │   ├── store/                     # State management
│   │   └── hooks/                     # Custom hooks
│   └── package.json
│
├── 📁 services/                        # Microservices
│   │
│   ├── 📁 auth-service/                # Port 3001
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📁 user-service/                # Port 3004
│   │   └── [cấu trúc tương tự]
│   │
│   ├── 📁 organization-service/       # Port 3013 - MỚI
│   │   ├── src/
│   │   │   ├── controllers/           # OrganizationController
│   │   │   ├── models/                 # Department, Team, Role models
│   │   │   ├── routes/                 # Organization routes
│   │   │   ├── services/               # Organization business logic
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📁 chat-system-service/         # Port 3006 - MỚI (Microservice)
│   │   ├── src/
│   │   │   ├── controllers/            # ChatSystemController
│   │   │   ├── models/                 # Chat, Message models
│   │   │   ├── routes/                 # Chat system routes
│   │   │   ├── services/               # Chat system logic
│   │   │   │   ├── chatService.js
│   │   │   │   └── messageService.js
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   │   ├── database.js
│   │   │   │   └── redis.js
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📁 chat-room-service/           # Port 3007 - MỚI (Microservice)
│   │   ├── src/
│   │   │   ├── controllers/            # ChatRoomController
│   │   │   ├── models/                 # Room, RoomMember models
│   │   │   ├── routes/                 # Room routes
│   │   │   ├── services/               # Room management logic
│   │   │   │   ├── roomService.js
│   │   │   │   └── memberService.js
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📁 chat-user-service/            # Port 3008 - MỚI (Microservice)
│   │   ├── src/
│   │   │   ├── controllers/            # ChatUserController
│   │   │   ├── models/                 # ChatUser, UserStatus models
│   │   │   ├── routes/                 # User routes
│   │   │   ├── services/               # User management logic
│   │   │   │   ├── userStatusService.js
│   │   │   │   └── presenceService.js
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📁 work-management-service/      # Port 3009 - MỚI (MongoDB)
│   │   ├── src/
│   │   │   ├── controllers/            # TaskController, WorkItemController
│   │   │   ├── models/                 # Task, WorkItem, Timeline models
│   │   │   ├── routes/                 # Work routes
│   │   │   ├── services/               # Work management logic
│   │   │   │   ├── taskService.js
│   │   │   │   ├── workItemService.js
│   │   │   │   └── statusService.js
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   │   └── mongodb.js
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📁 document-service/             # Port 3010 - MỚI (AWS S3)
│   │   ├── src/
│   │   │   ├── controllers/            # DocumentController
│   │   │   ├── models/                 # Document, Version models
│   │   │   ├── routes/                 # Document routes
│   │   │   ├── services/               # Document management logic
│   │   │   │   ├── s3Service.js
│   │   │   │   ├── documentService.js
│   │   │   │   └── versionService.js
│   │   │   ├── middleware/
│   │   │   │   └── upload.js           # Multer config
│   │   │   ├── config/
│   │   │   │   └── aws.js
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📁 ai-agent-service/             # Port 3011 - MỚI
│   │   ├── src/
│   │   │   ├── controllers/            # AIAgentController
│   │   │   ├── models/                 # AI models
│   │   │   ├── routes/                 # AI routes
│   │   │   ├── services/               # AI logic
│   │   │   │   ├── summarizationService.js
│   │   │   │   ├── taskExtractionService.js
│   │   │   │   ├── reminderService.js
│   │   │   │   └── knowledgeService.js
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   │   └── openai.js
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📁 progress-tracking-service/    # Port 3012 - MỚI
│   │   ├── src/
│   │   │   ├── controllers/            # ProgressController
│   │   │   ├── models/                 # Progress, Analytics models
│   │   │   ├── routes/                 # Progress routes
│   │   │   ├── services/               # Progress tracking logic
│   │   │   │   ├── progressService.js
│   │   │   │   ├── analyticsService.js
│   │   │   │   └── bottleneckService.js
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📁 voice-service/                # Port 3005
│   │   └── [cấu trúc tương tự]
│   │
│   └── 📁 notification-service/        # Port 3003
│       └── [cấu trúc tương tự]
│
├── 📁 shared/                           # Shared Resources
│   ├── config/
│   │   └── mongo.js                    # MongoDB connection
│   ├── middleware/
│   │   └── auth.js                     # Authentication middleware
│   └── utils/
│       └── logger.js                   # Logger utility
│
├── 📄 docker-compose.yml                # Docker Compose config
├── 📄 ARCHITECTURE.md                   # Kiến trúc chi tiết
├── 📄 STRUCTURE.md                      # File này
└── 📄 README.md                         # Hướng dẫn chính
```

## Mô tả các Service

### Chat Services (Microservices)

#### 1. Chat System Service
- **Chức năng**: Quản lý hệ thống chat tổng thể
- **Database**: MongoDB (chat_system)
- **Dependencies**: chat-room-service, chat-user-service

#### 2. Chat Room Service
- **Chức năng**: Quản lý phòng chat, thành viên, phân quyền
- **Database**: MongoDB (chat_rooms)
- **Dependencies**: organization-service

#### 3. Chat User Service
- **Chức năng**: Quản lý người dùng chat, trạng thái online/offline
- **Database**: MongoDB (chat_users)
- **Dependencies**: user-service

### Work Management Services

#### 4. Work Management Service
- **Chức năng**: Quản lý nhiệm vụ, đầu việc, trạng thái, timeline
- **Database**: MongoDB (work_management)
- **Storage**: MongoDB collections

#### 5. Progress Tracking Service
- **Chức năng**: Theo dõi tiến độ, phân tích, phát hiện điểm nghẽn
- **Database**: MongoDB (progress_tracking)
- **Dependencies**: chat-system-service, work-management-service, document-service

### Document & Intelligence Services

#### 6. Document Service
- **Chức năng**: Quản lý tài liệu, version control
- **Storage**: AWS S3
- **Database**: MongoDB (document metadata)

#### 7. AI Agent Service
- **Chức năng**: Tổng hợp, tóm tắt, nhắc nhở, truy xuất tri thức
- **Dependencies**: chat-system-service, work-management-service, document-service

### Organization Service

#### 8. Organization Service
- **Chức năng**: Quản lý cơ cấu tổ chức, phòng ban, nhóm, vai trò
- **Database**: MongoDB (organization)

## Communication Flow

```
Client
  ↓
API Gateway (Port 3000)
  ↓
┌─────────────────────────────────────┐
│  Chat Services                      │
│  - Chat System Service (3006)       │
│  - Chat Room Service (3007)         │
│  - Chat User Service (3008)         │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│  Work Management                    │
│  - Work Management (3009)           │
│  - Progress Tracking (3012)         │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│  Intelligence                       │
│  - AI Agent (3011)                  │
│  - Document Service (3010)          │
└─────────────────────────────────────┘
```

## Database Strategy

- **MongoDB**: Tất cả dữ liệu nghiệp vụ (chat, work, organization, users)
- **AWS S3**: Lưu trữ tài liệu và files
- **Redis**: Cache, session, real-time data

## Port Allocation

| Service | Port | Description |
|---------|------|-------------|
| API Gateway | 3000 | Entry point |
| Auth Service | 3001 | Authentication |
| Notification Service | 3003 | Notifications |
| User Service | 3004 | User management |
| Voice Service | 3005 | Voice/Video |
| Chat System Service | 3006 | Chat system |
| Chat Room Service | 3007 | Chat rooms |
| Chat User Service | 3008 | Chat users |
| Work Management Service | 3009 | Work management |
| Document Service | 3010 | Documents |
| AI Agent Service | 3011 | AI agent |
| Progress Tracking Service | 3012 | Progress tracking |
| Organization Service | 3013 | Organization |

