# Gỡ `webhook-service`, cho producer gọi thẳng `notification-service`

> Tiếp nối phân tích mức độ cần thiết của việc tách service.
> Hai phát hiện khi khảo sát đã định hình plan này:
> 1. `webhook-service` hỗ trợ **7 domain / ~20 event**, nhưng toàn hệ thống chỉ phát **4 event** từ **4 call site**. Phần còn lại là dead code — xoá, không migrate.
> 2. Việc chuyển sang gọi thẳng `notification-service` **đã được làm một nửa**: `document-service` và `project-service` đều đã có `src/clients/notification.client.js`, và luồng board mới (`taskBoard.service.js`) đã dùng `notifyTaskAssigned` trực tiếp. Plan này chỉ hoàn tất phần còn sót.

---

## 1. Mục tiêu & phạm vi

### 1.1 Objective

- **Type:** Refactor (service consolidation)
- **Business reason:** Giảm số image phải build/push và số container phải vận hành. `webhook-service` chiếm 2 trong 23 entry của `docker-stack.yml` và 1 trong 18 image, trong khi không sở hữu dữ liệu gì.
- **Technical reason:** `webhook-service` hoàn toàn **stateless** (không Mongo, không Redis — đã xác nhận trong `services/webhook-service/.env`). Mỗi handler chỉ map field rồi gọi `POST /api/notifications` của `notification-service`. Mỗi notification hiện đi qua 2 hop HTTP thay vì 1. Quan trọng hơn: hướng đi thay thế đã tồn tại và đang chạy ổn định trong repo, nên đây là **hoàn tất một migration dở dang**, không phải mở hướng kiến trúc mới.
- **Expected outcome:** Xoá `webhook-service`; 3 producer còn lại gọi trực tiếp endpoint **đã có sẵn** bằng `x-internal-notification-token`. `notification-service` không bị sửa một dòng nào.

### 1.2 Success Criteria — Definition of Done

- [ ] `rg -n -i "webhook" services/ docker-stack.yml docker-stack.plan-a.yml docker-compose.core.yml docker-compose.dev.yml devops/swarm/ .env --glob '!node_modules'` trả về **0 kết quả**.
- [ ] `docker-stack.yml`: `grep -cE "^  [a-z0-9-]+:" docker-stack.yml` giảm **24 → 22** (21 service + 1 network); `rg -o "[A-Z_]+_IMAGE" docker-stack.yml | sort -u | wc -l` giảm **18 → 17**.
- [ ] Thư mục `services/webhook-service/` và 3 file `services/*/src/clients/webhook.client.js` không còn tồn tại.
- [ ] `.env` không còn `WEBHOOK_SERVICE_URL`, `WEBHOOK_SECRET`, `WEBHOOK_SERVICE_REPLICAS`, `WEBHOOK_DELIVERY_WORKER_REPLICAS`, `WEBHOOK_ASYNC_QUEUE`, `WEBHOOK_DELIVERY_QUEUE`.
- [ ] `git diff --name-only` **không** chứa bất kỳ file nào trong `services/notification-service/`.
- [ ] `git diff --name-only` **không** chứa `services/project-service/src/clients/notification.client.js` (tái dùng nguyên trạng, xem RULE-03).
- [ ] 4 notification vẫn được tạo với `type` hợp lệ theo enum model: `friend_request`, `friend_accepted`, `system`, `task_assigned`.
- [ ] `node --test services/friend-service/tests/ services/project-service/tests/ services/role-permission-service/tests/` pass, gồm test mới cho mapping friend và role.
- [ ] Smoke S1–S5 (§5.3) pass thủ công trên `https://voicehub.local`.
- [ ] Lỗi notification **không** làm fail nghiệp vụ chính: bỏ `NOTIFICATION_SERVICE_URL` khỏi env `project-service` rồi tạo task vẫn trả **2xx** (test I1).

### 1.3 In-Scope

- `friend-service`, `role-permission-service`: tạo `src/clients/notification.client.js` theo khuôn `document-service`, port 3 event (2 friend + 1 role).
- `project-service`: **không viết code client mới** — chuyển call site sang hàm `notifyTaskAssigned` đã có.
- Sửa 4 call site; xoá 3 `webhook.client.js`.
- Xoá `services/webhook-service/`; gỡ khỏi mọi file deploy, script build và `.env`.

### 1.4 Out-of-Scope

- **Không** thêm route mới vào `notification-service`. Dùng `POST /api/notifications/bulk` đã có.
- **Không** sửa bất kỳ file nào trong `services/notification-service/`.
- **Không** sửa `services/project-service/src/clients/notification.client.js` hay `src/utils/notificationTargets.js` — tái dùng nguyên trạng.
- **Không** migrate 16 handler dead code (meeting, document, chat, organization, và các event chưa từng phát của friend/task/role).
- **Không** chuyển sang event-driven qua RabbitMQ cho các producer này.
- **Không** đụng `summary-service`, `document-service`, `voice-stt-worker`, `report-service`.

---

## 2. Files Affected

### 2.1 CREATE

- `services/friend-service/src/clients/notification.client.js`
- `services/friend-service/tests/notificationClient.test.js`
- `services/role-permission-service/src/clients/notification.client.js`
- `services/role-permission-service/tests/notificationClient.test.js`

> `project-service` **không có file mới** — đây là hệ quả trực tiếp của việc nó đã sẵn `notification.client.js` + `notificationTargets.js` + test.

### 2.2 MODIFY

- `services/friend-service/src/services/friend.service.js` — 2 call site (~dòng 161 `requestSent`, ~263 `requestAccepted`)
- `services/project-service/src/services/task.service.js` — 1 call site (~dòng 163 `taskWebhook.created`)
- `services/role-permission-service/src/services/role.service.js` — 1 call site (~dòng 384 `roleWebhook.removed`)
- `docker-stack.yml` — xoá 2 entry `webhook-service` / `webhook-delivery-worker`; thêm `NOTIFICATION_SERVICE_URL` + `NOTIFICATION_INTERNAL_TOKEN` vào khối `environment` của `friend-service` và `role-permission-service`
- `docker-stack.plan-a.yml` — xoá 2 entry tương ứng
- `docker-compose.core.yml` — xoá service `webhook-service` và dòng `depends_on` ở gateway (dòng ~87)
- `docker-compose.dev.yml` — xoá entry `webhook-service` và comment nhắc uvicorn (dòng ~4)
- `devops/swarm/build-local-images.sh` — xoá dòng `webhook-service:...` **và** nhánh `if` build context riêng (dòng ~41, ~51–52)
- `devops/swarm/build-and-push.sh` — tương tự (dòng ~38, ~50–52)
- `.env` — xoá nhóm biến `WEBHOOK_*`

### 2.3 DELETE

- `services/webhook-service/` (toàn bộ, 1313 dòng Python)
- `services/friend-service/src/clients/webhook.client.js`
- `services/project-service/src/clients/webhook.client.js`
- `services/role-permission-service/src/clients/webhook.client.js`
- `devops/swarm/webhook-service-network.md`

### 2.4 DO NOT MODIFY

- `services/notification-service/**` — **toàn bộ**. Ràng buộc quan trọng nhất của plan: phía nhận bất biến, nên mọi notification hiện có (voice, org, document, board) nằm ngoài vùng rủi ro.
- `services/project-service/src/clients/notification.client.js`, `services/project-service/src/utils/notificationTargets.js` — tái dùng, không sửa.
- `services/project-service/src/services/taskBoard.service.js`, `planning.service.js`, `projectTeam.service.js`, `jobs/taskDueReminders.job.js` — các consumer khác của client, không chạm.
- `services/document-service/src/clients/notification.client.js` — chỉ làm khuôn mẫu.
- `api-gateway/**` — `webhook-service` chưa từng được mount qua gateway.
- `client/**` — FE không biết đến `webhook-service`.
- `shared/**`.

### 2.5 Dependency / Impact

```text
TRƯỚC
friend-service  ─┐
project-service ─┼─► webhook-service (HTTP, X-Webhook-Secret)
role-perm-svc   ─┘        ↓ dispatcher → handler → map payload
                          ↓
                    notification-service  POST /api/notifications

SAU
friend-service  ─┐
project-service ─┼─► notification-service  POST /api/notifications/bulk
role-perm-svc   ─┘   (x-internal-notification-token)
                          ↓
                    Mongo notification_db → realtime push   ← KHÔNG ĐỔI

(document-service và taskBoard.service.js đã đi đường này từ trước)
```

**Blast radius đã đo:**

| Hạng mục | Số lượng | Ghi chú |
|---|---|---|
| Domain dispatcher hỗ trợ | 7 | friend, task, meeting, document, chat, role, organization |
| Domain thực sự có producer | **3** | friend, task, role |
| Event thực sự được phát | **4** | `friend_request_sent`, `friend_request_accepted`, `role_removed`, `task_created` |
| Call site phải sửa | **4** | 2 friend, 1 project, 1 role-permission |
| Nơi khác gọi `/webhook/` | **0** | đã grep `services/`, `api-gateway/`, `client/` |
| Client notification phải viết mới | **2** | friend, role-permission (project đã có) |

Khối lượng port thực tế là **3 event (~90 dòng Python) → 2 client nhỏ trong Node**, không phải 1313 dòng. Event thứ tư (`task_created`) không cần viết mapping nào.

**Điều kiện env đã sẵn sàng:** cả 3 producer đều khai `env_file: - .env`, và root `.env` đã có `NOTIFICATION_SERVICE_URL` (dòng 22) lẫn `NOTIFICATION_INTERNAL_TOKEN` (dòng 51). `project-service` vốn đã dùng 2 biến này cho luồng board nên chắc chắn hoạt động. Việc thêm khối `environment:` tường minh cho 2 producer còn lại chỉ để đồng nhất với cách `document-service` khai, không phải điều kiện bắt buộc.

### 2.6 Nguồn dữ liệu

#### Sinh request / route mới?

| Loại | Kết luận |
|------|----------|
| **HTTP public / browser** | **Không** — FE không liên quan |
| **Route REST mới (service)** | **Không** — dùng `POST /api/notifications/bulk` đã tồn tại, đúng ràng buộc "không thêm REST route mới khi có thể dùng endpoint hiện có" |
| **Query / S2S nội bộ** | **Giảm 1 hop** cho mỗi notification thuộc 4 event |

#### Client request (không đổi, chỉ đổi bên gọi)

```http
POST /api/notifications/bulk
x-internal-notification-token: <NOTIFICATION_INTERNAL_TOKEN>
Content-Type: application/json
```

#### Nguồn gốc field → payload

| Field payload | Nguồn gốc |
|---|---|
| `userIds` | Người nhận, do producer quyết định (assignee / friendId / user bị gỡ role) |
| `type` | Hằng theo event, phải nằm trong enum model `Notification` |
| `title`, `content` | Chuỗi cố định + tên thực thể, lấy từ scope sẵn có của producer |
| `data` | Các id nghiệp vụ producer đang giữ |
| `actionUrl` | Đường dẫn FE |
| `excludeUserId` | Actor — để không tự báo chính mình |

#### Payload response

- Envelope `{ success, data }` / `{ success, queued }` — **không đổi**, plan không đụng controller.
- Producer **bỏ qua** body, chỉ đọc status 2xx để ghi log. Không field nào chảy ngược về FE.

#### Tối ưu response

**N/A** — plan không sinh hay đổi payload trả browser. Đây là endpoint S2S, FE không gọi.

#### FE consume / round-trip

- Không đổi. FE vẫn đọc qua `GET /api/notifications`.
- Round-trip phía server **giảm từ 2 xuống 1** cho 4 event trên.

---

## 3. Thiết kế & trách nhiệm module

### 3.1 Architecture

```text
<producer>/src/services/<domain>.service.js   (call site, fire-and-forget)
        ↓
<producer>/src/clients/notification.client.js  (dựng payload + POST, tự nuốt lỗi)
        ↓ HTTP + x-internal-notification-token
notification-service  POST /api/notifications/bulk  (KHÔNG ĐỔI)
```

### 3.2 Responsibility

| Layer / Module | Responsibility | Must not |
|---|---|---|
| `*.service.js` (call site) | Gọi client sau khi nghiệp vụ chính thành công | Không để lỗi notification chặn nghiệp vụ; không tự dựng payload |
| `clients/notification.client.js` | Dựng payload; POST kèm internal token; **tự bắt mọi lỗi, trả `false`** | Không throw ra ngoài; không chứa logic nghiệp vụ |
| `notification-service` | Validate, lưu, đẩy realtime — như cũ | Không được sửa trong plan này |
| `webhook-service` | (bị xoá) | — |

### 3.3 Data Flow

```text
Task created (có assignee)
  → task.service.js: notifyTaskAssigned({ actorId: createdBy, assigneeId, task })
  → client: uniqueUserIds loại actor → nếu rỗng thì dừng
  → POST /api/notifications/bulk
  → notification-service: lưu + realtime push
  → lỗi bất kỳ: client log.warn, trả false, task vẫn tạo thành công
```

### 3.4 Business Rules

- **RULE-01 — Giữ nguyên nội dung notification của friend và role.** Port đúng chuỗi từ `src/handlers/*.py`, không dịch, không thêm field:

  | Event | Người nhận | `type` | `title` | `content` | `actionUrl` |
  |---|---|---|---|---|---|
  | `friend_request_sent` | `friendId` | `friend_request` | `New Friend Request` | `{userName} sent you a friend request` | `/friends/requests` |
  | `friend_request_accepted` | `userId` | `friend_accepted` | `Friend Request Accepted` | `{friendName} has accepted your friend request` | `/friends/{friendId}` |
  | `role_removed` | `userId` | `system` | `Role Removed` | `The role '{roleName}' has been removed from you in {serverName}` | `/servers/{serverId}/roles` |

  Cả 3 giá trị `type` đều đã nằm trong `enum` của `services/notification-service/src/models/Notification.js` — **đã xác minh**, không cần sửa model.

- **RULE-02 — Notification là side-effect phụ.** Client phải tự bắt lỗi và trả `false`, không throw. Đây là ràng buộc **bắt buộc**, không phải khuyến nghị: call site trong `task.service.js` nằm trong `try { ... } catch { throw new Error('Error creating task: ...') }`, và **không** có `try/catch` riêng quanh lời gọi webhook. Nó dựa hoàn toàn vào việc `sendWebhook` tự nuốt lỗi. Nếu client mới throw, **tạo task sẽ fail**. Hàm `postBulkNotifications` sẵn có đã thoả điều kiện này (trả `false` ở cả nhánh non-2xx lẫn `catch`); client mới của friend/role phải viết theo đúng khuôn đó.

- **RULE-03 — `task_created` tái dùng `notifyTaskAssigned`, chấp nhận đổi ngôn ngữ hiển thị.** Không viết hàm mapping mới cho task. Hệ quả có chủ đích:

  | | Đường webhook (cũ) | `notifyTaskAssigned` (mới) |
  |---|---|---|
  | `type` | `task_assigned` | `task_assigned` (giống) |
  | `title` | `New Task Assigned` | `Bạn được giao việc` |
  | `content` | `You have been assigned to: {title}` | `Thẻ "{title}" đã được giao cho bạn.` |
  | `actionUrl` | luôn `/app/collaborate/projects` | `projectHubActionUrl(...)` → cũng `/app/collaborate/projects` khi task không có `projectId` |
  | Tự gán cho mình | chặn bằng `assignee_id != created_by` | chặn bằng `excludeUserId: actorId` |

  Lý do chấp nhận: cùng một `type: 'task_assigned'` hiện đã tồn tại **hai bản chữ** trong hệ thống — bản tiếng Anh từ webhook và bản tiếng Việt từ `taskBoard.service.js`. Tái dùng giúp thống nhất về một bản, phù hợp phần còn lại của sản phẩm, và **không phải viết dòng mapping nào**. `actionUrl` không đổi trên thực tế vì task legacy không mang `projectId`.

- **RULE-04 — Chỉ port event đang sống.** 3 event trong RULE-01 + `task_created` theo RULE-03. Mọi handler khác bị xoá cùng `webhook-service`. Cần lại sau này thì viết mới trong producer tương ứng.

- **RULE-05 — Không cải tiến kèm.** Không bổ sung `projectId` còn thiếu cho task, không dịch friend/role sang tiếng Việt, không đổi `actionUrl`. Trộn cải tiến vào đây sẽ khiến không phân biệt được lỗi do port hay do đổi hành vi. Ghi nhận là việc riêng.

### 3.5 Constraints

- Không break public API; không route public nào thay đổi.
- Không đổi schema, không migration.
- `notification-service` bất biến.
- Bảo mật: thay `WEBHOOK_SECRET` bằng `NOTIFICATION_INTERNAL_TOKEN` — token đã được `document-service` và `project-service` dùng cho đúng endpoint này, không tạo cơ chế xác thực mới.

---

## 4. Thứ tự triển khai

### 4.1 Dependency

```text
Step 1 (2 client mới + test, chưa đổi call site)
   → Step 2 (đổi 4 call site, xoá 3 webhook.client.js)
   → [REVIEW GATE + smoke]
   → Step 3 (xoá webhook-service + dọn infra/env)
```

Thứ tự này giữ hệ thống chạy được sau **mỗi** step: hết Step 1 chưa đổi hành vi; hết Step 2 producer đã đi đường mới trong khi `webhook-service` vẫn còn (rollback chỉ cần revert 4 call site, không cần deploy lại gì khác); Step 3 mới gỡ hạ tầng. Không gộp Step 2 và 3 để tránh vừa mất đường cũ vừa chưa chắc đường mới đúng.

### 4.2 Steps

#### STEP 1 — Viết client notification cho `friend-service` và `role-permission-service`

- **Objective:** Có đường gọi mới đã được test, chưa ai dùng.
- **Files:** CREATE 2 client + 2 test. READ ONLY: `services/document-service/src/clients/notification.client.js` và `services/project-service/src/clients/notification.client.js` (khuôn mẫu), `services/webhook-service/src/handlers/{friend,role}_handler.py` (nguồn chuỗi).
- **Implementation:**
  - Theo khuôn sẵn có: đọc `NOTIFICATION_SERVICE_URL` + `NOTIFICATION_INTERNAL_TOKEN`, có `isConfigured()`, `validateStatus: () => true`, `timeout` 8000ms, `logger.warn` khi không 2xx, trả `false` ở mọi nhánh lỗi (RULE-02).
  - Tách phần **dựng payload** thành hàm thuần và **export** để test so khớp chuỗi mà không cần mạng.
  - `friend-service`: `notifyFriendRequestSent`, `notifyFriendRequestAccepted`.
  - `role-permission-service`: `notifyRoleRemoved`.
- **Dependencies:** none
- **Expected result:** 4 file mới; không file cũ nào bị sửa.
- **Validation:** `node --test services/friend-service/tests/ services/role-permission-service/tests/` pass; `git diff --name-only` chỉ hiện file mới.

#### STEP 2 — Chuyển 4 call site, xoá client webhook

- **Objective:** Producer đi đường mới.
- **Files:** MODIFY `friend.service.js`, `task.service.js`, `role.service.js`. DELETE 3 `webhook.client.js`.
- **Implementation:**
  - `friend.service.js`, `role.service.js`: thay lời gọi, **giữ nguyên** `try/catch` và câu log sẵn có.
  - `task.service.js`: thay `taskWebhook.created(...)` bằng `notifyTaskAssigned({ actorId: createdBy, assigneeId, task })` từ `../clients/notification.client`. Giữ nguyên cấu trúc `if (assigneeId) { ... }`; **không** thêm `try/catch` mới (client đã nuốt lỗi — RULE-02).
- **Dependencies:** Step 1
- **Expected result:** Không còn `require('../clients/webhook.client')` ở bất kỳ đâu.
- **Validation:**
  ```bash
  rg -n "webhook.client|friendWebhook|taskWebhook|roleWebhook" services/friend-service/src services/project-service/src services/role-permission-service/src
  node --test services/friend-service/tests/ services/project-service/tests/ services/role-permission-service/tests/
  ```
  Lệnh 1 phải rỗng.

#### STEP 3 — Xoá `webhook-service` và dọn hạ tầng

- **Objective:** Thu hồi image, container và secret.
- **Files:** DELETE `services/webhook-service/`, `devops/swarm/webhook-service-network.md`. MODIFY 4 file deploy, 2 script build, `.env`.
- **Implementation:** Gỡ 2 entry khỏi `docker-stack.yml` và `docker-stack.plan-a.yml`; xoá service + dòng `depends_on: - webhook-service` ở gateway trong `docker-compose.core.yml`; xoá entry và comment trong `docker-compose.dev.yml`; xoá dòng `webhook-service:services/webhook-service/Dockerfile` **và** nhánh `if` build context riêng trong cả hai script build; xoá nhóm `WEBHOOK_*` khỏi `.env`; thêm `NOTIFICATION_SERVICE_URL` + `NOTIFICATION_INTERNAL_TOKEN` vào `environment:` của `friend-service` và `role-permission-service`.
- **Dependencies:** Step 2 + review gate + smoke pass
- **Expected result:** Stack còn 21 service entry và 17 image.
- **Validation:**
  ```bash
  grep -cE "^  [a-z0-9-]+:" docker-stack.yml              # 22
  rg -o "[A-Z_]+_IMAGE" docker-stack.yml | sort -u | wc -l # 17
  rg -n -i "webhook" services/ docker-stack.yml docker-stack.plan-a.yml \
    docker-compose.core.yml docker-compose.dev.yml devops/swarm/ .env --glob '!node_modules'
  ```
  Lệnh 3 phải rỗng.

### 4.3 Review Gates

- Sau Step 2: **STOP.** Chạy smoke S1–S5 trên stack dev trước khi gỡ hạ tầng. `webhook-service` lúc này vẫn chạy nhưng không còn ai gọi — đây là cửa sổ an toàn để rollback bằng cách revert đúng 4 call site.
- Câu lệnh giao việc: `Implement step 2 only. Stop for review.`

---

## 5. Test Plan

### 5.1 Unit

| Mã | Nội dung | File |
|---|---|---|
| U1 | `buildFriendRequestSentNotification` khớp `type/title/content/actionUrl` theo bảng RULE-01 | `services/friend-service/tests/notificationClient.test.js` |
| U2 | `buildFriendRequestAcceptedNotification` khớp bảng; `actionUrl` chứa `friendId` | như trên |
| U3 | `buildRoleRemovedNotification` khớp bảng; `actionUrl` chứa `serverId`; fallback `Role` / `Server` khi thiếu tên | `services/role-permission-service/tests/notificationClient.test.js` |
| U4 | Hàm gửi trả `false` (không throw) khi thiếu `NOTIFICATION_SERVICE_URL` | mỗi service 1 case |

Các test chỉ gọi hàm dựng payload thuần, không mở socket, không ghi đĩa — đúng test hygiene của dự án (mẫu: `services/document-service/tests/notificationClient.test.js`).

Không thêm test cho `task_created`: nó tái dùng `notifyTaskAssigned` vốn đã có `services/project-service/tests/notificationClient.test.js` phủ `projectHubActionUrl` và `uniqueUserIds`.

### 5.2 Integration

| Mã | Kịch bản | Pass khi |
|---|---|---|
| I1 | Bỏ `NOTIFICATION_SERVICE_URL` khỏi env `project-service`, tạo task có assignee | API tạo task vẫn **2xx**, log có `warn`, không 5xx (chứng minh RULE-02) |
| I2 | Đặt `NOTIFICATION_INTERNAL_TOKEN` sai ở `friend-service` | Producer log warn HTTP 401, gửi kết bạn vẫn 2xx |

### 5.3 Smoke

Chạy sau Step 2, trước review gate, trên `https://voicehub.local`:

| Mã | Luồng | Pass khi |
|---|---|---|
| S1 | A gửi lời mời kết bạn tới B | B thấy chuông `New Friend Request`, bấm ra `/friends/requests` |
| S2 | B chấp nhận | A thấy chuông `Friend Request Accepted`, link `/friends/{friendId}` |
| S3 | Tạo task gán cho user khác | Assignee thấy chuông `Bạn được giao việc` (RULE-03) |
| S4 | Tạo task tự gán cho chính mình | **Không** phát sinh notification |
| S5 | Gỡ role của một user | User đó thấy chuông `Role Removed` |

### 5.4 Regression

- Notification ngoài 4 event trên phải còn nguyên — đây là bằng chứng `notification-service` không bị chạm:
  - **document shared** (`document-service`)
  - **voice room join request**
  - **org events** (`orgEventsConsumer`)
  - **board flow** của `project-service`: kéo thẻ đổi assignee (`taskBoard.service.js`), thẻ chuyển Done, nhắc hạn (`taskDueReminders.job.js`) — quan trọng vì dùng chung client vừa được tái sử dụng.
- `node --test shared/tests/` — không đổi kết quả.
- Chat DM, voice, login/bootstrap: health + đăng nhập không 5xx.

### 5.5 Mock / Fixture

- **Mock:** không mock HTTP. Test chỉ chạm hàm dựng payload thuần — đây là lý do Step 1 yêu cầu tách và export hàm này.
- **Fixture:** object plain trong test, không file, không ghi đĩa.

### 5.6 Commands

```bash
# Unit
node --test services/friend-service/tests/
node --test services/project-service/tests/
node --test services/role-permission-service/tests/

# Regression shared
node --test shared/tests/

# Xác minh sạch tham chiếu (sau Step 3)
rg -n -i "webhook" services/ docker-stack.yml docker-stack.plan-a.yml \
  docker-compose.core.yml docker-compose.dev.yml devops/swarm/ .env --glob '!node_modules'

# Xác minh giảm image / entry
grep -cE "^  [a-z0-9-]+:" docker-stack.yml
rg -o "[A-Z_]+_IMAGE" docker-stack.yml | sort -u | wc -l

# Deploy dev sau Step 2 — CHỈ build 3 service đã sửa
for s in friend-service project-service role-permission-service; do
  bash devops/swarm/build-local-images.sh $s
  docker service update --force --update-parallelism 1 --update-order start-first voicehub_$s
done

# Sau Step 3 — gỡ 2 service khỏi swarm
docker service rm voicehub_webhook-service voicehub_webhook-delivery-worker
bash devops/swarm/swarm-exited-task-gc.sh

# Bảo mật (có gỡ secret WEBHOOK_SECRET khỏi .env)
bash devops/scripts/check-security-env.sh
```

Không áp dụng: `cd client && npm run build` — plan không đụng `client/`.

### 5.7 Pass Criteria

- [ ] U1–U4 pass.
- [ ] I1, I2 pass — nghiệp vụ chính không bao giờ 5xx vì notification.
- [ ] S1–S5 pass thủ công.
- [ ] Regression: document shared, voice room join, org events, **và toàn bộ board flow của project-service** vẫn tạo notification bình thường.
- [ ] `git diff --name-only` không chứa `services/notification-service/` và không chứa `services/project-service/src/clients/notification.client.js`.
- [ ] `rg -i webhook` sạch ở các đường dẫn liệt kê.
- [ ] `check-security-env.sh` không báo lỗi mới.

---

## 6. Risk & trade-off

### 6.1 Risks

| Risk | Impact | Probability | Trigger | Mitigation | Fallback |
|---|---|---|---|---|---|
| Client mới **throw** khiến tạo task fail | **High** | Medium | `POST /api/tasks` trả 5xx khi notification lỗi | RULE-02; `notifyTaskAssigned` sẵn có đã trả `false` thay vì throw; test I1 kiểm đúng tình huống | Revert Step 2 (4 call site) |
| Hồi quy lan sang board flow do tái dùng client chung | **High** | Low | Kéo thẻ / đổi assignee không còn chuông | §2.4 cấm sửa `notification.client.js`; Pass Criteria kiểm `git diff`; regression phủ board flow | Revert Step 2 |
| User thắc mắc chuông task đổi chữ sang tiếng Việt | Low | **High** | Phản hồi sau deploy | RULE-03 ghi rõ đây là thay đổi có chủ đích, thống nhất với bản `taskBoard` đã chạy | Viết hàm mapping riêng giữ chữ tiếng Anh |
| Sai chuỗi `type` khiến Mongo validate fail | Medium | Low | Notification không tạo, log 400 | Đã đối chiếu 4 `type` với `enum` trong model; U1–U3 so khớp chuỗi | Sửa hằng trong client |
| Producer thiếu env notification sau deploy | Medium | Low | Log warn `not configured`, mất chuông | 3 producer đã có `env_file: .env` chứa sẵn 2 biến; Step 3 thêm `environment:` tường minh | Thêm env rồi `service update --force` |
| Agent sửa lan sang `notification-service` | High | Medium | Diff chạm `services/notification-service/` | §1.4 + §2.4 cấm tuyệt đối; kiểm bằng `git diff --name-only` | Revert phần thừa |
| Mất khả năng nhận webhook từ hệ thống ngoài | Low | Low | Yêu cầu tích hợp bên thứ ba sau này | `webhook-service` hiện **chỉ** nhận từ 3 service nội bộ, không có integration ngoài | Dựng endpoint chuyên dụng khi thực sự có nhu cầu |

### 6.2 Trade-off

- **Decision:** Xoá `webhook-service`; friend/role tự dựng payload trong client mới, task tái dùng `notifyTaskAssigned` sẵn có; tất cả gọi `POST /api/notifications/bulk`.
- **Alternative A:** Thêm route `POST /internal/events/:domain` vào `notification-service`, chuyển nguyên dispatcher sang đó. — **Loại**, vi phạm ràng buộc "không thêm REST route mới khi có thể dùng endpoint hiện có", và vẫn phải viết lại dispatcher cho 4 event còn sống.
- **Alternative B:** Giữ nguyên `webhook-service`. — **Loại**, đang trả giá 1 image, 2 container, 1 secret và 1 hop mạng cho một lớp chỉ map field.
- **Alternative C:** Chuyển sang event-driven qua RabbitMQ. — **Loại ở plan này**; sạch hơn về coupling nhưng là thay đổi lớn hơn nhiều so với lợi ích, và `notification-service` đã có `NOTIFICATION_ASYNC_DISPATCH` + dispatch worker nên phần async đã được giải quyết sau endpoint.
- **Alternative D (cho riêng task):** Viết hàm mapping mới giữ nguyên chữ tiếng Anh. — **Loại**, sẽ duy trì vĩnh viễn hai bản chữ cho cùng `type: 'task_assigned'` và thêm code không cần thiết.
- **Reason:** Phương án chọn không sửa một dòng nào trong `notification-service`, nên rủi ro với luồng notification đang chạy gần như bằng 0. Chi phí thực tế nhỏ hơn ước lượng ban đầu rất nhiều: 4 event thay vì 20, và chỉ 2 client phải viết vì `project-service` đã có sẵn.

### 6.3 Security

- **Secret bị gỡ:** `WEBHOOK_SECRET` biến mất khỏi `.env` và khỏi hệ thống. Lưu ý `.env` **đang được git track**, nên việc xoá nằm trong commit; giá trị cũ vẫn còn trong lịch sử git — nếu coi đó là secret thật thì cần xoay vòng riêng, **ngoài phạm vi** plan này.
- **Không tạo cơ chế xác thực mới:** dùng `NOTIFICATION_INTERNAL_TOKEN` với header `x-internal-notification-token`, đúng như `document-service` và `project-service` đang làm. `internalNotificationAuth` cố tình **không** fallback sang `GATEWAY_INTERNAL_TOKEN` — giữ nguyên ranh giới đó, không nới lỏng.
- **Không đụng luồng xác thực người dùng:** endpoint đích vốn là route nội bộ, không qua JWT user; không thêm route public.
- **Log:** client chỉ log status code và message, **không** log token, không log toàn bộ payload.
- Sau khi áp dụng: `bash devops/scripts/check-security-env.sh` + checklist `devops/scripts/security-regression-smoke.md`.

### 6.4 Rollback

- **Sau Step 2:** `git revert` phần sửa 4 call site và khôi phục 3 `webhook.client.js`. `webhook-service` vẫn đang chạy nên hệ thống trở lại nguyên trạng ngay, chỉ cần deploy lại 3 producer.
- **Sau Step 3:** cần revert commit **và** dựng lại `webhook-service` (`bash devops/swarm/build-local-images.sh webhook-service` rồi `deploy-stack.sh`), đồng thời khôi phục `WEBHOOK_*` trong `.env`. Đây chính là lý do §4.3 đặt review gate **trước** Step 3.
- Không có migration, không có state để khôi phục — `webhook-service` stateless.

### 6.5 Observability

- Trước khi gỡ, kiểm tra log `webhook-service` trong ~24h xem có domain nào ngoài friend/task/role được gọi không (phòng producer ngoài repo):
  ```bash
  docker service logs --since 24h voicehub_webhook-service | rg "Unknown .* event type|/webhook/"
  ```
- Sau khi chuyển, quan sát log 3 producer tìm `[notification.client]` mức `warn` — tần suất cao nghĩa là sai token hoặc sai URL.
- Dấu hiệu hồi quy rõ nhất là **im lặng**: không lỗi nào trong log nhưng người dùng không thấy chuông. Vì vậy S1–S5 là kiểm thử thủ công bắt buộc, không thay bằng đọc log.
