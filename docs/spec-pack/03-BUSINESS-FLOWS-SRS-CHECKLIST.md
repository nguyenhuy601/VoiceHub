# 03 - BUSINESS FLOWS + SRS CHECKLIST

Tai lieu nay gom:
1) Luong nghiep vu cot loi
2) Quy tac du lieu/nghiep vu
3) Mau SRS de dien nhanh
4) Checklist "dung du chuan vang"

## 1. Luong nghiep vu cot loi

### Flow 1 - Register va activate account

Muc tieu:
- Nguoi dung dang ky thanh cong
- Tai khoan chi active sau verify email

Sequence:
1. Client POST /api/auth/register
2. auth-service validate input + password strength
3. auth-service tao UserAuth (isEmailVerified=false, isActive=false)
4. auth-service tao emailVerificationToken va gui email (neu SMTP da cau hinh)
5. User click link verify -> GET /api/auth/verify-email?token=...
6. auth-service verify token, activate account
7. auth-service goi user-service tao profile
8. User login duoc

Business rules:
- Email unique
- Chua verify thi khong login
- Tai khoan co lock tam thoi khi login sai nhieu lan

### Flow 2 - Authenticated request qua gateway

Muc tieu:
- Tat ca request private duoc auth va authorize dung context

Sequence:
1. Client gui request co Authorization: Bearer <JWT>
2. Gateway auth middleware verify token
3. Gateway map action theo METHOD+PATH
4. Gateway extract serverId/organizationId
5. Gateway goi POST /api/permissions/check
6. Neu allowed -> proxy toi service dich
7. Neu deny -> tra 403

Business rules:
- Public routes bo qua auth
- Mot so routes bo qua permission (nhung van can auth)
- Action-level control theo role matrix

### Flow 3 - Friend request -> accept -> notify

Muc tieu:
- Quan he ban be hop le + thong bao cho doi tuong lien quan

Sequence:
1. User A POST /api/friends/request (friendId=B)
2. friend-service check user hop le, khong tu ket ban voi chinh minh
3. friend-service tao relationship pending
4. User B POST /api/friends/:friendId/accept
5. friend-service chuyen status accepted va tao quan he doi ung
6. friend-service publish webhook friend event
7. webhook-service xu ly event va goi notification-service tao thong bao

Business rules:
- Khong duplicate relation
- Co trang thai blocked

### Flow 4 - Task assignment -> comment/status -> notify

Muc tieu:
- Quan ly task day du lifecycle

Sequence:
1. POST /api/tasks tao task
2. task-service verify organization va assignee qua service lien quan
3. task-service save task
4. task-service publish webhook task_created/task_assigned
5. webhook-service tao notification
6. PATCH/PUT /api/tasks/:id de doi status/fields
7. POST /api/tasks/:id/comments de them thao luan

Business rules:
- Creator/assignee moi duoc sua mot so truong
- Delete theo soft delete (isActive false)

### Flow 5 - DM realtime qua socket-service

Muc tieu:
- Gui tin nhan realtime, dong thoi persist DB

Sequence:
1. Client connect Socket.IO namespace /chat voi token
2. Client emit friend:send
3. socket-service verify payload
4. socket-service POST /api/messages sang chat-service
5. chat-service luu Message
6. socket-service emit friend:new_message den nguoi nhan, friend:sent den nguoi gui

Business rules:
- Payload can receiverId + content
- Loi se emit event error

### Flow 6 - Meeting lifecycle

Muc tieu:
- Quan ly buoi hop theo trang thai

Sequence:
1. POST /api/meetings tao buoi hop
2. POST /api/meetings/:id/start
3. POST /api/meetings/:id/participants them nguoi tham gia
4. DELETE participant khi roi phong
5. POST /api/meetings/:id/end ket thuc hop

Business rules:
- Participant chi add khi meeting active

### Flow 7 - Document versioning

Muc tieu:
- Luu document va phien ban ke tiep

Sequence:
1. POST /api/documents tao document metadata
2. POST /api/documents/:id/versions tao ban moi
3. Service day ban cu vao previousVersions

Business rules:
- Chi uploader duoc update/upload version/delete

## 2. Quy tac nghiep vu theo domain

### Identity
- Email unique toan he
- userId trong profile la duy nhat

### Social
- Friend relation co state machine: pending -> accepted | blocked

### Access control
- Role gan theo server context
- Permission check theo resource/action

### Work
- Task can organizationId
- assignee la optional nhung neu co phai ton tai

### Communication
- Message cho phep DM (receiverId) hoac room (roomId)

## 3. Mau SRS de dien nhanh

Ban co the copy khung nay thanh tai lieu chinh thuc.

### 3.1 Scope
- He thong: VoiceHub
- Muc tieu
- Nguoi dung muc tieu
- Ranh gioi he thong

### 3.2 Actors
- Guest
- Authenticated User
- Server Member
- Server Admin
- Organization Owner
- System Integrator

### 3.3 Functional Requirements (FR)

Mau:
- FR-<domain>-<id>
- Mo ta
- Input
- Processing rules
- Output
- Error cases
- Permission precondition

Vi du:
- FR-AUTH-001: Dang ky tai khoan
- FR-FRIEND-003: Chap nhan loi moi ket ban
- FR-TASK-004: Cap nhat trang thai task

### 3.4 Non-Functional Requirements (NFR)
- Security
- Reliability
- Performance
- Scalability
- Observability
- Maintainability

### 3.5 Data dictionary

Voi moi entity:
- Ten truong
- Kieu
- Bat buoc/khong
- Rang buoc
- Nguon sinh
- Vong doi

### 3.6 API contract

Voi moi endpoint:
- Method/path
- Auth requirement
- Permission requirement
- Request schema
- Response success schema
- Error schema
- Side effects (webhook/cache)

### 3.7 Sequence and state
- Sequence cho luong cot loi
- State machine cho Friend, Task, Meeting

### 3.8 Assumptions and constraints
- Legacy endpoints ton tai
- 2 kenh realtime song song
- Tai lieu cu co the xung dot code

## 4. Permission matrix mau

| Resource | Read | Write | Delete | Admin |
|---|---|---|---|---|
| user | user:read | user:write | - | - |
| friend | friend:read | friend:write | - | - |
| organization | organization:read | organization:write | organization:delete | - |
| server | server:read | server:write | server:delete | - |
| chat | chat:read | chat:write | chat:delete | chat:admin (neu can) |
| task | task:read | task:write | task:delete | task:admin (neu can) |
| document | document:read | document:write | document:delete | document:admin (neu can) |
| voice | voice:read | voice:write | - | voice:admin (neu can) |

## 5. Checklist "dung du chuan vang"

Danh dau PASS khi viet xong:

- [ ] Co mo ta dung actor va boundary
- [ ] Co map day du route gateway -> service
- [ ] Co mo ta auth + permission flow
- [ ] Co mo ta full endpoint cho 11 domain services
- [ ] Co schema entity cot loi va rang buoc
- [ ] Co sequence cho >= 5 luong nghiep vu cot loi
- [ ] Co error handling taxonomy 400/401/403/404/503/504
- [ ] Co NFR security/performance/observability
- [ ] Co ghi ro pham vi legacy va migration
- [ ] Co acceptance criteria test duoc

## 6. Acceptance criteria de review tai lieu dac ta

1. Mot BA/Dev moi khong doc code van dung duoc tai lieu de hieu he thong.
2. Co the tao OpenAPI tu API section ma khong phai hoi lai owner.
3. Co the ve sequence diagram tu flow section ma khong missing actor/buoc.
4. Co the test permission theo matrix ma khong ambiguous.
5. Tai lieu khong mau thuan voi service ports/route map dang chay.

## 7. Quyet dinh de tranh mo ho trong dac ta

- Canonical gateway la cua vao REST duy nhat.
- Canonical realtime cho DM: socket-service /chat + persist qua chat-service.
- Chat room/domain enterprise route se mo ta theo chat-service hien tai, neu can split future thi ghi la roadmap.
