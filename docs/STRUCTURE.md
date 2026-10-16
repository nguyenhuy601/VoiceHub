# Cấu trúc thư mục VoiceHub (đồng bộ mã nguồn)

Repo gốc: **`VoiceHub/`** (không dùng tên `VoiceChat-app` trong đường dẫn).

## Tổng quan

```
VoiceHub/
├── api-gateway/                 # Express: auth JWT, permission, proxy REST + /socket.io
├── client/                      # React 18 + Vite (SPA)
├── services/
│   ├── auth-service/
│   ├── user-service/
│   ├── organization-service/
│   ├── role-permission-service/
│   ├── chat-service/            # REST + socket nội bộ (message, channel, …)
│   ├── voice-service/
│   ├── project-service/
│   ├── notification-service/
│   ├── socket-service/        # Socket.IO namespace /chat
│   ├── ai-project-planning-service/
│   ├── report-service/
│   └── report-etl-worker/
├── shared/                      # Code dùng chung (Node): mongo, logger, middleware, …
├── docs/                        # Kiến trúc, migrate, cấu trúc, LICENSE, spec-pack, …
│   ├── ARCHITECTURE.md
│   ├── MIGRATION.md
│   ├── STRUCTURE.md             # File này
│   └── LICENSE
├── docker-compose.yml           # include infra + core (+ tùy chọn dev)
└── README.md
```

## Mẫu thư mục một service Node (điển hình)

```
services/<name>/
├── src/
│   ├── server.js
│   ├── app.js
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── models/
│   └── middleware/ hoặc middlewares/
├── Dockerfile
├── package.json
└── .env / ENV.example
```

## Frontend (`client/src/`)

```
client/src/
├── App.jsx                 # Routes, React.lazy
├── main.jsx                # Theme, Locale, Auth, Socket providers
├── context/                # AuthContext, SocketContext, ThemeContext, LocaleContext
├── pages/                  # Trang theo route
├── components/             # Chat, Layout, Organization, Shared, ui, …
├── services/               # api.js, *Service.js, api/*API.js
│   └── HTTP_CONVENTIONS.md
├── locales/                # appStrings, homePage, …
├── hooks/
└── utils/
```

## Không tồn tại trong repo hiện tại

Các thư mục sau **không** có trong codebase: `chat-system-service`, `chat-room-service`, `chat-user-service`, `work-management-service`, `progress-tracking-service`, `ai-agent-service`, `task-service`, `ai-task-service`, `ai-task-worker`, `summary-service`, `summary-worker` (đã gỡ / scaffold cũ — Task API thuộc **`project-service`**; AI Project planning thuộc **`ai-project-planning-service`**). Chat gom trong **`chat-service`**.
