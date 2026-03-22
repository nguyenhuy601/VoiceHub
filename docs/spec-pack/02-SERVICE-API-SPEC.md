# 02 - SERVICE AND API SPEC

Muc tieu: ban mo ta dac ta API va service behavior dua tren bang nay la du.

## A. Auth Service (3001)

### Domain responsibility
- Account lifecycle: register -> verify email -> activate
- Login/logout
- Refresh token
- Forgot/reset password
- Change password

### Main entity
- UserAuth
  - email (unique)
  - password (hash)
  - isEmailVerified, isActive
  - refreshToken
  - emailVerificationToken, passwordResetToken
  - lockUntil, loginAttempts

### Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/refresh-token
- GET /api/auth/verify-email
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- POST /api/auth/logout
- POST /api/auth/change-password
- GET /api/auth/me

### Rules
- Chua verify email -> khong cho login
- Co lock tam thoi sau nhieu lan sai mat khau

## B. User Service (3004)

### Domain responsibility
- Ho so user
- Tim user theo id/phone/username
- Trang thai hien dien (online/offline/away/busy)

### Main entity
- UserProfile
  - userId (unique)
  - username, email
  - displayName, avatar, bio
  - phone, dateOfBirth, location
  - status, lastSeen
  - preferences

### Endpoints
- POST /api/users
- GET /api/users/me
- PATCH /api/users/me
- PATCH /api/users/me/status
- GET /api/users/search
- GET /api/users/phone/:phone
- GET /api/users/username/:username
- GET /api/users/:userId

## C. Friend Service (3014)

### Domain responsibility
- Friend request flow
- Friend graph 2 chieu
- Block/unblock

### Main entity
- Friend
  - userId, friendId
  - status: pending/accepted/blocked
  - requestedBy
  - acceptedAt

### Endpoints
- GET /api/friends
- GET /api/friends/user/:userId
- POST /api/friends/request
- POST /api/friends/:friendId/accept
- POST /api/friends/:friendId/reject
- GET /api/friends/requests
- GET /api/friends/:friendId/relationship
- POST /api/friends/:friendId/block
- POST /api/friends/:friendId/unblock
- DELETE /api/friends/:friendId
- GET /api/friends/search

### Integration
- Goi user-service de check/enrich user
- Phat webhook friend events

## D. Organization Service (3013)

### Domain responsibility
- Quan ly organization
- Quan ly server thuoc organization
- Quan ly member trong server

### Main entities
- Organization
- Server
- Membership (dang ton tai)
- Department, Team (dang ton tai)

### Endpoints - organization
- POST /api/organizations
- GET /api/organizations/:organizationId
- PATCH /api/organizations/:organizationId
- PUT /api/organizations/:organizationId
- DELETE /api/organizations/:organizationId

### Endpoints - server
- POST /api/servers
- GET /api/servers/organization/:organizationId
- GET /api/servers/:serverId
- POST /api/servers/:serverId/members
- DELETE /api/servers/:serverId/members/:userId
- PATCH /api/servers/:serverId
- PUT /api/servers/:serverId
- DELETE /api/servers/:serverId

## E. Role-Permission Service (3015)

### Domain responsibility
- CRUD role
- Gan/thu hoi role
- Tinh permission cho user trong server
- Permission check endpoint cho gateway

### Main entities
- Role
  - name
  - serverId, organizationId
  - permissions: [{resource, actions[]}]
  - priority, isDefault
- UserRole
  - userId, serverId, roleId
  - assignedBy, expiresAt

### Endpoints
- POST /api/roles
- GET /api/roles/server/:serverId
- GET /api/roles/:roleId
- POST /api/roles/assign
- POST /api/roles/remove
- GET /api/roles/user/:userId/server/:serverId
- PATCH /api/roles/:roleId
- PUT /api/roles/:roleId
- DELETE /api/roles/:roleId
- POST /api/permissions/check
- GET /api/permissions/user/:userId/server/:serverId
- GET /api/permissions/user/:userId/server/:serverId/role

### Permission behavior
- Action format: resource:verb (vd task:write)
- admin hoac * duoc coi la phep bao trum

## F. Chat Service (3006)

### Domain responsibility
- Message CRUD cho DM/room
- Danh dau da doc
- Socket integration noi bo

### Main entity
- Message
  - senderId
  - receiverId (DM)
  - roomId (room)
  - content
  - messageType
  - isRead, readAt
  - organizationId

### Endpoints
- POST /api/messages
- GET /api/messages
- GET /api/messages/:messageId
- PATCH /api/messages/:messageId/read
- DELETE /api/messages/:messageId

## G. Voice Service (3005)

### Domain responsibility
- Meeting lifecycle
- Participant lifecycle

### Main entity
- Meeting
  - title, hostId
  - serverId, organizationId
  - participants[]
  - status: scheduled/active/ended/cancelled
  - startTime, endTime

### Query (GET /api/meetings) — calendar / list
- `startFrom`, `startTo` (ISO): loc `startTime` trong khoang; bat buoc ca hai neu dung loc thoi gian.
- Mac dinh chi tra meeting ma user la host hoac co trong `participants` (userId tu JWT / header gateway).
- `status=cancelled` bi loai khoi list khi dung `startFrom`/`startTo` (calendar).

### Endpoints
- POST /api/meetings
- GET /api/meetings
- GET /api/meetings/:meetingId
- POST /api/meetings/:meetingId/start
- POST /api/meetings/:meetingId/end
- POST /api/meetings/:meetingId/participants
- DELETE /api/meetings/:meetingId/participants/:userId

### Alias
- /api/voice dung chung route voi /api/meetings

## H. Task Service (3009)

### Domain responsibility
- Quan ly task va comment
- Status progression

### Main entity
- Task
  - title, description
  - assigneeId, createdBy
  - serverId, organizationId
  - status: todo/in_progress/review/done/cancelled
  - priority: low/medium/high/urgent
  - dueDate, completedAt
  - comments[]

### Query (GET /api/tasks)
- Filter thuong dung: `assigneeId`, `organizationId`, `status`, `priority`, `page`, `limit`.
- **dueFrom**, **dueTo** (ISO): loc `dueDate` trong khoang (ca hai bat buoc neu truyen); toi da 180 ngay; sap xep theo `dueDate` tang dan khi dung loc nay.
- User scope: gateway gui `x-user-id`; task cua user = assignee hoac creator.

### Endpoints
- POST /api/tasks
- GET /api/tasks
- GET /api/tasks/:taskId
- PATCH /api/tasks/:taskId
- PUT /api/tasks/:taskId
- POST /api/tasks/:taskId/comments
- DELETE /api/tasks/:taskId

### Alias
- /api/work alias cung route task

## I. Document Service (3010)

### Domain responsibility
- Quan ly metadata tai lieu
- Quan ly version

### Main entity
- Document
  - name, description
  - uploadedBy
  - organizationId, serverId
  - fileUrl, fileSize, mimeType
  - version, previousVersions[]
  - tags

### Endpoints
- POST /api/documents
- GET /api/documents
- GET /api/documents/:documentId
- PATCH /api/documents/:documentId
- PUT /api/documents/:documentId
- POST /api/documents/:documentId/versions
- DELETE /api/documents/:documentId

## J. Notification Service (3003)

### Domain responsibility
- Notification inbox theo user

### Main entity
- Notification
  - userId
  - type
  - title, content
  - data
  - isRead, readAt
  - actionUrl

### Endpoints
- POST /api/notifications
- POST /api/notifications/bulk
- GET /api/notifications
- GET /api/notifications/user/:userId
- PATCH /api/notifications/read-friend-related — body `{ counterpartyId }`: danh dau da doc thong bao `friend_request` / `friend_accepted` lien quan (sau accept/reject ket ban tren client)
- PATCH /api/notifications/:notificationId/read
- PATCH /api/notifications/read-all
- DELETE /api/notifications/:notificationId
- DELETE /api/notifications/read/all

## K. Webhook Service (3016, Python)

### Domain responsibility
- Event dispatcher
- Verify X-Webhook-Secret
- Goi notification service theo tung event

### Endpoints
- POST /webhook/friend
- POST /webhook/task
- POST /webhook/meeting
- POST /webhook/document
- POST /webhook/chat
- POST /webhook/role
- POST /webhook/organization

### Event groups
- friend_request_sent, friend_request_accepted, friend_removed
- task_created, task_assigned, task_completed, task_updated
- meeting_created, meeting_started, meeting_ended, participant_joined
- document_uploaded, document_updated, document_shared
- message_created, message_mentioned
- role_assigned, role_removed
- server_member_added, server_member_removed, organization_created

## L. Socket Service (3017)

### Domain responsibility
- Socket.IO namespace /chat
- JWT auth cho socket
- friend:send -> call chat-service -> emit friend:new_message

### Contract event chinh
- inbound: friend:send {receiverId, content, messageType}
- outbound: friend:new_message, friend:sent, error

## M. Integration matrix (service-to-service)

| From | To | Muc dich |
|---|---|---|
| API Gateway | role-permission-service | check permission |
| API Gateway | business services | proxy request |
| auth-service | user-service | tao profile sau verify |
| friend-service | user-service | verify/enrich user |
| task-service | user-service | verify assignee |
| task-service | organization-service | verify org/server |
| voice-service | user-service | verify host/user |
| voice-service | organization-service | verify server |
| document-service | user-service | verify uploader |
| business services | webhook-service | publish domain events |
| webhook-service | notification-service | tao notification |
| socket-service | chat-service | persist tin nhan DM |

## N. Error semantics khuyen nghi khi viet dac ta

- 400: invalid input / missing context (vd thieu serverId cho action can context)
- 401: missing/invalid/expired token
- 403: permission denied
- 404: resource/service not found
- 503: downstream service unavailable
- 504: gateway timeout

## O. Notable legacy/inconsistency can ghi chu trong dac ta

- Ton tai route file legacy song song trong mot so service (camelCase va dot.routes).
- Wrapper API phia frontend co endpoint cu chua map 1-1 voi backend route moi.
- Song song 2 kenh realtime (socket-service va socket trong chat-service).
