# 04 - SRS FULL (BAN HOAN CHINH DE DUNG NGAY)

Phien ban: 1.0
Ngay: 2026-03-21
He thong: VoiceHub
Pham vi: Toan bo ma nguon hien tai trong repo

## 1. Gioi thieu

### 1.1 Muc dich tai lieu

Tai lieu nay dac ta yeu cau phan mem cho he thong VoiceHub theo trang thai ma nguon hien tai, bao gom:

- Functional requirements theo domain
- Non-functional requirements
- Data requirements
- API va integration behavior
- Luong nghiep vu
- Dieu kien nghiem thu

### 1.2 Doi tuong doc

- Product Owner
- Business Analyst
- System Analyst
- Backend/Frontend Engineers
- QA Engineers
- DevOps/SRE

### 1.3 Dinh nghia

- Organization: don vi to chuc cap cao
- Server: khong gian lam viec/giao tiep thuoc organization
- RBAC: role-based access control theo server
- Webhook event: su kien domain gui sang webhook-service

## 2. Tong quan he thong

### 2.1 Mo ta tong quan

VoiceHub la he thong giao tiep noi bo doanh nghiep theo mo hinh microservices, co gateway trung tam cho REST API, socket layer cho realtime, webhook layer cho xu ly su kien bat dong bo, va data layer dung MongoDB + Redis.

### 2.2 Kien truc logic

- Presentation: client React
- Edge: API Gateway
- Domain: auth, user, friend, organization, role-permission, chat, voice, task, document, notification
- Integration: webhook-service, socket-service
- Data: MongoDB Atlas, Redis

### 2.3 Danh sach thanh phan va cong

- api-gateway: 3000
- auth-service: 3001
- notification-service: 3003
- user-service: 3004
- voice-service: 3005
- chat-service: 3006
- task-service: 3009
- document-service: 3010
- organization-service: 3013
- friend-service: 3014
- role-permission-service: 3015
- webhook-service: 3016
- socket-service: 3017

## 3. Actors va phan quyen nghiep vu

### 3.1 Actors

- Guest: chua dang nhap
- Authenticated User: da dang nhap
- Server Member: thanh vien server
- Server Admin: quan tri server
- Organization Owner/Admin: quan tri cap to chuc
- System Integrator: he thong tich hop noi bo

### 3.2 Muc tieu actor

- Guest: tao tai khoan, dang nhap
- Authenticated User: chat, ket ban, xem thong bao, cap nhat profile
- Member/Admin: thao tac tren task, document, meeting theo quyen
- Owner/Admin: quan ly organization/server/member/role

## 4. Functional Requirements

## 4.1 AUTH domain

- FR-AUTH-001: Dang ky tai khoan moi voi email/password/ho ten
- FR-AUTH-002: Xac thuc email truoc khi cho phep login
- FR-AUTH-003: Dang nhap tra access va refresh token
- FR-AUTH-004: Refresh access token
- FR-AUTH-005: Dang xuat va vo hieu hoa phien
- FR-AUTH-006: Doi mat khau khi da dang nhap
- FR-AUTH-007: Quen mat khau va dat lai mat khau
- FR-AUTH-008: Khoa tam thoi sau nhieu lan login sai

## 4.2 USER domain

- FR-USER-001: Tao profile nguoi dung
- FR-USER-002: Lay profile cua chinh minh
- FR-USER-003: Cap nhat profile cua chinh minh
- FR-USER-004: Tim user theo username/phone/search
- FR-USER-005: Cap nhat trang thai hien dien

## 4.3 FRIEND domain

- FR-FRIEND-001: Gui loi moi ket ban
- FR-FRIEND-002: Chap nhan loi moi ket ban
- FR-FRIEND-003: Tu choi loi moi ket ban
- FR-FRIEND-004: Xem danh sach ban be
- FR-FRIEND-005: Xoa ban be
- FR-FRIEND-006: Chan/bo chan user
- FR-FRIEND-007: Kiem tra relationship giua 2 user

## 4.4 ORGANIZATION/SERVER domain

- FR-ORG-001: Tao organization
- FR-ORG-002: Xem, cap nhat, xoa organization
- FR-SERVER-001: Tao server trong organization
- FR-SERVER-002: Xem danh sach server theo organization
- FR-SERVER-003: Them/xoa member trong server
- FR-SERVER-004: Cap nhat/xoa server

## 4.5 RBAC domain

- FR-RBAC-001: Tao role theo server
- FR-RBAC-002: Cap nhat/xoa role
- FR-RBAC-003: Gan role cho user
- FR-RBAC-004: Thu hoi role
- FR-RBAC-005: Lay role/permission cua user trong server
- FR-RBAC-006: Kiem tra quyen truy cap (permission check)

## 4.6 CHAT domain

- FR-CHAT-001: Tao tin nhan DM hoac room
- FR-CHAT-002: Lay danh sach tin nhan theo filter
- FR-CHAT-003: Xem chi tiet tin nhan
- FR-CHAT-004: Danh dau da doc
- FR-CHAT-005: Xoa tin nhan
- FR-CHAT-006: Realtime DM qua socket-service

## 4.7 VOICE domain

- FR-VOICE-001: Tao meeting
- FR-VOICE-002: Bat dau meeting
- FR-VOICE-003: Ket thuc meeting
- FR-VOICE-004: Them participant
- FR-VOICE-005: Xoa participant
- FR-VOICE-006: Lay danh sach/chi tiet meeting

## 4.8 TASK domain

- FR-TASK-001: Tao task
- FR-TASK-002: Lay danh sach/chi tiet task
- FR-TASK-003: Cap nhat thong tin task
- FR-TASK-004: Doi trang thai task
- FR-TASK-005: Them comment vao task
- FR-TASK-006: Xoa task (soft delete)

## 4.9 DOCUMENT domain

- FR-DOC-001: Tao document metadata
- FR-DOC-002: Lay danh sach/chi tiet document
- FR-DOC-003: Cap nhat document
- FR-DOC-004: Tao version moi cho document
- FR-DOC-005: Xoa document (soft delete)

## 4.10 NOTIFICATION domain

- FR-NOTI-001: Tao notification don
- FR-NOTI-002: Tao notification hang loat
- FR-NOTI-003: Lay notification theo user
- FR-NOTI-004: Danh dau da doc
- FR-NOTI-005: Danh dau doc tat ca
- FR-NOTI-006: Xoa notification

## 4.11 WEBHOOK domain

- FR-WEBHOOK-001: Nhan webhook theo tung domain event
- FR-WEBHOOK-002: Verify secret header
- FR-WEBHOOK-003: Dispatch den handler phu hop
- FR-WEBHOOK-004: Tao notification tu event

## 4.12 GATEWAY domain

- FR-GW-001: Xac thuc JWT cho route private
- FR-GW-002: Authorize action theo RBAC
- FR-GW-003: Proxy den service dich theo route map
- FR-GW-004: Fail response khi service timeout/down

## 5. Business Rules

- BR-001: Email la unique trong auth
- BR-002: Khong verify email thi khong duoc login
- BR-003: Friend relation khong duoc duplicate
- BR-004: Khong duoc tu ket ban voi chinh minh
- BR-005: Permission phu thuoc server context
- BR-006: Action format la resource:verb
- BR-007: Task can organization context
- BR-008: Meeting participant chi hop le khi meeting active
- BR-009: Chi uploader duoc sua/xoa/version document
- BR-010: Tat ca webhook inbound phai co secret hop le

## 6. Non-Functional Requirements

### 6.1 Security

- NFR-SEC-001: JWT bat buoc cho route private
- NFR-SEC-002: Permission check bat buoc cho route can context
- NFR-SEC-003: Secret phai quan ly theo moi truong, khong dung default trong production
- NFR-SEC-004: Webhook endpoint phai verify X-Webhook-Secret

### 6.2 Performance

- NFR-PERF-001: Gateway timeout co cau hinh (60s)
- NFR-PERF-002: Permission va friend list duoc cache bang Redis
- NFR-PERF-003: Pagination cho list endpoints lon

### 6.3 Reliability

- NFR-REL-001: Service phai co health endpoint
- NFR-REL-002: Graceful shutdown cho service Node
- NFR-REL-003: Loi downstream phai duoc xu ly va tra ma loi phu hop

### 6.4 Maintainability

- NFR-MTN-001: Tach lop routes/controllers/services/models
- NFR-MTN-002: Shared lib dung chung mongo/redis/auth/webhook
- NFR-MTN-003: Co migration plan cho route legacy

### 6.5 Observability

- NFR-OBS-001: Log duoc tao tai gateway va service layer
- NFR-OBS-002: Loi proxy/downstream phai co thong tin service dich

## 7. Data Requirements

### 7.1 Core entities

- UserAuth
- UserProfile
- Friend
- Organization
- Server
- Role
- UserRole
- Message
- Meeting
- Task
- Document
- Notification

### 7.2 Data integrity

- Unique indexes cho email, userId profile, role name per server, user-server-role
- Enum cho status/priority/type theo tung entity

## 8. Integration Requirements

- IR-001: Gateway -> role-permission-service check permission
- IR-002: auth-service -> user-service tao profile sau verify
- IR-003: friend/task/organization/role -> webhook-service
- IR-004: webhook-service -> notification-service
- IR-005: socket-service -> chat-service luu message

## 9. Error Handling Contract

- 400: invalid input/missing required context
- 401: unauthorized (missing/invalid/expired token)
- 403: permission denied
- 404: resource not found
- 503: service unavailable
- 504: gateway timeout

## 10. API Boundary and Canonical Paths

- Canonical REST entry: api-gateway
- Canonical realtime DM: socket-service namespace /chat
- Canonical permission decision: role-permission-service /api/permissions/check

## 11. Known Constraints and Risks

- Co route/service wrapper legacy song song
- Co 2 kenh realtime ton tai song song
- Tai lieu cu trong repo co phan khong con khop code
- Mot so secret mac dinh ton tai trong code va can duoc bo khi production

## 12. Deployment Requirements

- Docker Compose phai khoi dong du mongo, redis, gateway va cac service
- Moi service can env dung port va service URL
- Webhook service can Python runtime va requirements

## 13. Acceptance Criteria

- AC-001: Bo tai lieu nay du de doi BA/Dev moi viet lai API catalog
- AC-002: Co the sinh sequence cho 5 luong cot loi khong can doc code
- AC-003: Co the test permission matrix theo role/server
- AC-004: Co the trace event tu domain service -> webhook -> notification
- AC-005: Khong mau thuan voi topology va route map he thong hien tai

## 14. Testability Mapping

- Unit test theo service layer tung domain
- Integration test cho cross-service flows (auth->user, task->org/user, webhook->notification)
- E2E test qua gateway cho cac use case chinh

## 15. Roadmap De-noi-loan (khuyen nghi)

- Chuan hoa 1 bo route file, bo route legacy
- Chuan hoa frontend service wrappers theo endpoint backend hien tai
- Chot 1 kenh realtime canonical
- Them ratelimit va policy bao mat production-ready
