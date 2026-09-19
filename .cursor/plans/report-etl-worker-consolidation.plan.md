# Gộp `report-etl-worker` vào `report-service` bằng cờ env

> Nguồn: phân tích mức độ cần thiết của việc tách service (summary / report / voice-stt / webhook / document).
> Kết luận dẫn tới plan này: `report-etl-worker` không phải một service — nó là shim 41 dòng nạp source của `report-service` qua đường dẫn filesystem tương đối.

---

## 1. Mục tiêu & phạm vi

### 1.1 Objective

- **Type:** Refactor (architecture cleanup)
- **Business reason:** Giảm số deployable phải bảo trì trong repo. `report-etl-worker` tạo ảo giác rằng hệ thống có một ETL worker độc lập, khiến mọi người đọc kiến trúc sau này hiểu sai topology và có thể cố deploy một thứ không build được.
- **Technical reason:** `services/report-etl-worker/src/worker.js` chỉ set `ENABLE_ANALYTICS_ETL_CONSUMER=true` rồi `require('../../report-service/src/workers/analyticsEtlConsumer.js')`. Đây là cross-package filesystem dependency: package không có `Dockerfile` và chỉ chạy được khi thư mục `report-service` nằm cạnh trong cùng build context, nên không thể đóng gói thành image độc lập. Trong khi đó `services/report-service/src/server.js` **đã gọi sẵn** `runAnalyticsEtlConsumerLoop()`, nên shim này hoàn toàn dư thừa.
- **Expected outcome:** Xóa package thừa; cách bật ETL consumer (cờ env) và cách split deploy trong tương lai được ghi rõ trong `services/report-service/README.md`. Hành vi runtime không đổi vì cả hai package hiện không được deploy.

### 1.2 Success Criteria — Definition of Done

- [ ] `rg -n "report-etl-worker" --glob "!node_modules" --glob "!.cursor/plans/*"` trả về **0 kết quả**.
- [ ] Thư mục `services/report-etl-worker/` không còn tồn tại.
- [ ] `node --test services/report-service/tests/` giữ nguyên **4 pass / 0 fail** (bằng baseline đo được trước khi sửa).
- [ ] `node --test shared/tests/dashboardProjection.test.js shared/tests/scaleBoundaryFlags.test.js` pass.
- [ ] `git diff --name-only` **không** chứa `docker-stack.yml`, `docker-compose.swarm-extra.yml`, `docker-compose.core.yml`, `.env`, hay bất kỳ file nào trong `api-gateway/`.
- [ ] `services/report-service/README.md` có mục mô tả `ENABLE_ANALYTICS_ETL_CONSUMER` (điều kiện bật, biến phụ thuộc `RABBITMQ_URL` + `ANALYTICS_MONGODB_URI`) và cách chạy ETL như process riêng khi cần scale.
- [ ] `node -e "require('./services/report-service/src/workers/analyticsEtlConsumer.js')"` nạp được, và `isConsumerEnabled()` trả `false` khi không set cờ.

### 1.3 In-Scope

- Xóa toàn bộ package `services/report-etl-worker/`.
- Bổ sung tài liệu cờ ETL vào `services/report-service/README.md`.

### 1.4 Out-of-Scope

- **Không** quyết định số phận của `report-service` (giữ, hoàn thiện, hay xóa) — đó là quyết định sản phẩm riêng, cần plan khác.
- **Không** thêm `Dockerfile` cho `report-service`, không thêm entry vào `docker-stack.yml`, không bật ETL ở bất kỳ môi trường nào.
- **Không** sửa logic trong `analyticsEtlConsumer.js`, `dashboardProjectionConsumer.js`, `userPerformance.warehouse.js`.
- **Không** đụng `shared/config/reportServiceFlags.js` hay BFF dashboard của gateway.
- **Không** đụng các service khác trong phân tích gốc (summary, webhook, document, voice-stt).

---

## 2. Files Affected

### 2.1 CREATE

- none

### 2.2 MODIFY

- `services/report-service/README.md` — thêm mục "Analytics ETL consumer" (cờ env + hướng dẫn split deploy).

### 2.3 DELETE

- `services/report-etl-worker/package.json`
- `services/report-etl-worker/src/worker.js`
- `services/report-etl-worker/` (thư mục rỗng sau khi xóa 2 file trên)

### 2.4 DO NOT MODIFY

- `services/report-service/src/**` (toàn bộ source, gồm `server.js` và `workers/analyticsEtlConsumer.js`)
- `services/report-service/tests/**`
- `shared/config/reportServiceFlags.js`
- `shared/messaging/analyticsEvents.js`
- `api-gateway/src/config/services.js`, `api-gateway/src/bff/**`
- `docker-stack.yml`, `docker-compose.swarm-extra.yml`, `docker-compose.core.yml`, `docker-compose.dev.yml`
- `.env` và mọi `services/*/.env`
- `devops/swarm/build-local-images.sh`, `devops/swarm/deploy-stack.sh`
- `docs/architecture/ADR-003-report-olap.md`

### 2.5 Dependency / Impact

```text
services/report-etl-worker/src/worker.js   (DELETE — shim)
  ↓ require() theo đường dẫn tương đối
services/report-service/src/workers/analyticsEtlConsumer.js   (giữ nguyên)
  ↑ đã được gọi sẵn bởi
services/report-service/src/server.js  →  runAnalyticsEtlConsumerLoop()  (giữ nguyên)
  ↓ chỉ chạy khi
ENABLE_ANALYTICS_ETL_CONSUMER=true + RABBITMQ_URL + ANALYTICS_MONGODB_URI
  ↓
Deploy surface: KHÔNG CÓ — đã xác minh 0 tham chiếu trong mọi *.yml / *.sh / .env
```

**Blast radius đo được:** `rg` toàn repo cho `report-etl-worker|report_etl|REPORT_ETL` chỉ khớp 3 dòng, **tất cả đều nằm trong chính package sắp xóa** (2 dòng log trong `worker.js`, 1 dòng `"name"` trong `package.json`). Không có consumer, không có script build, không có biến môi trường, không có entry deploy. Đây là xóa cô lập hoàn toàn.

`scripts/sync-node-deps.mjs` duyệt thư mục bằng `readdirSync` nên tự động bỏ qua package đã xóa, không cần sửa.

### 2.6 Nguồn dữ liệu

**N/A — không đụng API.** Plan không thêm/sửa route, không đổi payload response, không sinh request mới từ FE hay S2S. Không có consumer nào của `/api/reports` bị ảnh hưởng vì `report-service` hiện không được mount (gateway chỉ mount khi `isReportServiceEnabled()` true, mà `.env` không có `REPORT_SERVICE_URL`).

---

## 3. Thiết kế & trách nhiệm module

### 3.1 Architecture

Thay đổi ở tầng **process topology**, không ở tầng route/controller:

```text
TRƯỚC (danh nghĩa)          SAU (thực tế, đã đúng sẵn)
─────────────────           ──────────────────────────
report-etl-worker  ─┐       report-service (1 image)
  (shim, no image)  │         ├── HTTP: app.listen(PORT)
                    ├──►      ├── dashboardProjectionConsumer  (cờ riêng)
report-service      │         └── analyticsEtlConsumer         (ENABLE_ANALYTICS_ETL_CONSUMER)
  (đã nhúng consumer)┘
```

### 3.2 Responsibility

| Layer / Module | Responsibility | Must not |
|----------------|----------------|----------|
| `report-service/src/server.js` | Bootstrap HTTP + gọi `runAnalyticsEtlConsumerLoop()` / `runDashboardProjectionConsumerLoop()`; xử lý SIGTERM | Không tự quyết định bật consumer — luôn để hàm tự kiểm tra cờ |
| `workers/analyticsEtlConsumer.js` | Tự gate bằng `isConsumerEnabled()`; bind queue, ack/nack, DLQ | Không giả định luôn được bật; không ghi DB OLTP |
| `services/report-etl-worker` | (bị xóa) | — |
| `README.md` | Ghi hợp đồng vận hành: cờ nào bật cái gì, cần biến nào | Không mô tả deployable không tồn tại |

### 3.3 Data Flow

Không đổi. Luồng ETL vẫn là:

```text
RabbitMQ topic exchange (ANALYTICS_EVENT_EXCHANGE)
  → ANALYTICS_ETL_QUEUE (quorum)
  → processMessage() → ingestAnalyticsEnvelope()
  → Analytics Mongo (ANALYTICS_MONGODB_URI, tách khỏi OLTP)
  → lỗi → ANALYTICS_ETL_DLQ
```

### 3.4 Business Rules

- **RULE-01:** ETL consumer chỉ chạy khi `ENABLE_ANALYTICS_ETL_CONSUMER` ∈ {`true`,`1`,`yes`} **và** có `RABBITMQ_URL`. Mặc định (không set) là **tắt** — giữ đúng ADR-003 "Không bật ETL production trong commit này".
- **RULE-02:** Analytics store phải dùng URI riêng (`ANALYTICS_MONGODB_URI`), không share DB OLTP với project/task. Plan này không được nới lỏng ràng buộc đó.
- **RULE-03:** Khi thật sự cần tách ETL thành process riêng để scale, dùng **cùng image** `REPORT_SERVICE_IMAGE` với `command` override + env khác — theo đúng tiền lệ đã có trong repo là cặp `webhook-service` / `webhook-delivery-worker` (chung `WEBHOOK_SERVICE_IMAGE`, khác `command`). Không tạo package Node riêng chỉ để `require()` source của package khác.

### 3.5 Constraints

- Không break public API: plan không đụng route nào.
- Không đổi schema, không migration.
- Không đổi hành vi runtime: cả `report-service` lẫn `report-etl-worker` hiện đều không nằm trong bất kỳ file deploy nào, nên tác động runtime bằng 0.
- Giữ ADR-003 làm nguồn sự thật; README chỉ diễn giải cách vận hành, không mâu thuẫn ADR.

---

## 4. Thứ tự triển khai

### 4.1 Dependency

```text
Step 1 (xác minh + baseline) → Step 2 (xóa package) → [REVIEW GATE] → Step 3 (tài liệu)
```

Thứ tự quan trọng vì Step 1 chốt bằng chứng "0 tham chiếu ngoài" và số test baseline; nếu Step 1 phát hiện tham chiếu bất ngờ thì Step 2 phải dừng và plan cần sửa §2.

### 4.2 Steps

#### STEP 1 — Xác minh cô lập & chốt baseline

- **Objective:** Chứng minh không có consumer nào của `report-etl-worker` và ghi lại số test baseline để so sánh sau khi xóa.
- **Files:** READ ONLY — toàn repo.
- **Implementation:**
  ```bash
  rg -n "report-etl-worker|report_etl|REPORT_ETL" --glob '!node_modules' --glob '!*.pyc'
  rg -n "REPORT_SERVICE_IMAGE|REPORT_SERVICE_URL" --glob '*.yml' --glob '*.sh' --glob '*.env' --glob '.env*'
  node --test services/report-service/tests/
  ```
- **Dependencies:** none
- **Expected result:** Lệnh 1 chỉ trả về các dòng nằm trong `services/report-etl-worker/`. Lệnh 2 trả về rỗng. Lệnh 3 in `# pass 4` / `# fail 0`.
- **Validation:** Nếu lệnh 1 trả về bất kỳ file nào **ngoài** `services/report-etl-worker/`, **STOP** — cập nhật §2.5 rồi mới đi tiếp.

#### STEP 2 — Xóa package `report-etl-worker`

- **Objective:** Gỡ deployable giả khỏi repo.
- **Files:** DELETE — `services/report-etl-worker/package.json`, `services/report-etl-worker/src/worker.js`, và thư mục `services/report-etl-worker/`.
- **Implementation:** `git rm -r services/report-etl-worker`. Không sửa file nào khác trong step này.
- **Dependencies:** Step 1
- **Expected result:** `services/report-etl-worker/` biến mất; `git status` chỉ hiện các file đã xóa.
- **Validation:**
  ```bash
  test ! -d services/report-etl-worker && echo "removed"
  node --test services/report-service/tests/
  node -e "const m=require('./services/report-service/src/workers/analyticsEtlConsumer.js'); console.log('enabled=', m.isConsumerEnabled())"
  ```
  Kỳ vọng: `removed`, `# pass 4 / # fail 0`, và `enabled= false`.

#### STEP 3 — Ghi tài liệu cờ ETL

- **Objective:** Ghi lại hợp đồng vận hành để người sau không tạo lại package shim.
- **Files:** MODIFY — `services/report-service/README.md`
- **Implementation:** Thêm một mục "Analytics ETL consumer" nêu: (a) bật bằng `ENABLE_ANALYTICS_ETL_CONSUMER=true`, cần thêm `RABBITMQ_URL` và `ANALYTICS_MONGODB_URI`; (b) mặc định tắt theo ADR-003; (c) khi cần chạy ETL như process riêng thì dùng cùng `REPORT_SERVICE_IMAGE` với env khác, theo tiền lệ `webhook-delivery-worker` (RULE-03). Giữ văn phong ngắn gọn như phần README sẵn có; **không** tạo file markdown mới.
- **Dependencies:** Step 2 + review gate
- **Expected result:** README có mục mới, các mục cũ (Dashboard Read Model, link ADR) giữ nguyên.
- **Validation:** `rg -n "ENABLE_ANALYTICS_ETL_CONSUMER" services/report-service/README.md` trả về kết quả; `git diff --stat` chỉ hiện 1 file thay đổi.

### 4.3 Review Gates

- Sau Step 2: **STOP.** Chờ reviewer xác nhận không có deploy pipeline nội bộ nào (ngoài repo) đang trỏ tới `report-etl-worker` trước khi viết tài liệu.
- Câu lệnh giao việc: `Implement step 2 only. Stop for review.`

---

## 5. Test Plan

### 5.1 Unit

- `services/report-service/tests/dashboardReadModel.store.test.js` và `userPerformance.warehouse.test.js` — xác nhận việc xóa package không kéo theo module nào của `report-service`.
- `shared/tests/dashboardProjection.test.js`, `shared/tests/scaleBoundaryFlags.test.js` — xác nhận cờ report/dashboard trong `shared/` không đổi hành vi.
- Không thêm test mới: plan chỉ xóa code chết, không thêm logic. Việc `analyticsEtlConsumer.js` tự gate đã được bao phủ bởi kiểm tra `isConsumerEnabled()` trong Validation của Step 2.

### 5.2 Integration

- **Skip có chủ đích.** `report-service` không có `Dockerfile` và không nằm trong `docker-stack.yml` / compose nào, nên không tồn tại đường đi integration qua gateway để kiểm thử. Ghi rõ lý do skip trong báo cáo đóng plan.

### 5.3 Smoke

- Kiểm tra tĩnh rằng bề mặt deploy không đổi:
  ```bash
  git diff --name-only | rg "docker-stack.yml|docker-compose|\.env|api-gateway/" ; echo "exit=$?"
  ```
  Kỳ vọng không có dòng nào khớp (`exit=1`).
- Stack Swarm đang chạy không cần build lại: không service nào tham chiếu package bị xóa, nên **không** chạy `build-local-images.sh` cho plan này.

### 5.4 Regression

- `node --test shared/tests/` — toàn bộ test shared phải giữ nguyên kết quả so với trước khi sửa.
- Luồng ổn định (chat DM, voice, notifications) **không** nằm trong blast radius; không cần redeploy, không cần smoke thủ công.

### 5.5 Mock / Fixture

- **Mock:** không cần. Không có test nào gọi RabbitMQ hay Mongo trong phạm vi plan.
- **Fixture:** không cần.
- **Test hygiene:** không tạo file tạm, không sinh artifact sau `node --test`.

### 5.6 Commands

```bash
# Baseline (Step 1) và sau mỗi step
node --test services/report-service/tests/

# Regression shared
node --test shared/tests/dashboardProjection.test.js shared/tests/scaleBoundaryFlags.test.js
node --test shared/tests/

# Xác minh sạch tham chiếu
rg -n "report-etl-worker|report_etl|REPORT_ETL" --glob '!node_modules' --glob '!.cursor/plans/*'

# Xác minh cờ vẫn mặc định tắt
node -e "const m=require('./services/report-service/src/workers/analyticsEtlConsumer.js'); console.log(m.isConsumerEnabled())"

# Xác minh bề mặt deploy không đổi
git diff --name-only
```

Không áp dụng: `cd client && npm run build` (không đụng FE), `bash devops/scripts/check-security-env.sh` (không đụng auth/secret).

### 5.7 Pass Criteria

- [ ] Unit `report-service`: 4 pass / 0 fail, bằng baseline.
- [ ] Unit `shared/tests/`: kết quả không đổi so với trước khi sửa.
- [ ] `rg` cho `report-etl-worker` trả về 0 kết quả (ngoài file plan này).
- [ ] `isConsumerEnabled()` in ra `false` khi không set env.
- [ ] `git diff --name-only` chỉ gồm các file trong §2.2 và §2.3.
- [ ] Integration được đánh dấu **skip có lý do** (service chưa có Dockerfile / chưa deploy), không báo pass giả.

---

## 6. Risk & trade-off

### 6.1 Risks

| Risk | Impact | Probability | Trigger | Mitigation | Fallback |
|------|--------|-------------|---------|------------|----------|
| Tồn tại pipeline/CI ngoài repo trỏ tới `report-etl-worker` | Medium | Low | Job CI báo "path not found" sau khi merge | Review Gate sau Step 2 yêu cầu reviewer xác nhận; `rg` trong Step 1 đã phủ toàn repo | `git revert` commit xóa (không có state, revert là đủ) |
| Mất ý định thiết kế "ETL chạy tách process" khi cần scale | Low | Medium | Sau này cần scale ETL độc lập | RULE-03 + Step 3 ghi rõ cách làm bằng image chung + env override | Đọc lại plan này và ADR-003 |
| Agent mở rộng scope sang xóa luôn `report-service` | High | Medium | Diff chạm `services/report-service/src/` | §1.4 Out-of-Scope + §2.4 DO NOT MODIFY liệt kê tường minh; Pass Criteria kiểm `git diff --name-only` | Revert phần thừa, giữ lại đúng 2 file trong §2.3 |
| Hiểu nhầm rằng xóa worker làm tắt ETL đang chạy | Low | Low | Câu hỏi từ reviewer | Nêu rõ: consumer đã nhúng trong `server.js`, và cả hai package đều chưa deploy | Không cần hành động |

### 6.2 Trade-off

- **Decision:** Xóa `services/report-etl-worker/`, giữ consumer nhúng trong `report-service` và điều khiển bằng `ENABLE_ANALYTICS_ETL_CONSUMER`.
- **Alternative:** Giữ package và "làm cho nó thật" — thêm `Dockerfile`, khai báo `@enterprise/shared` trong `dependencies`, thêm entry `docker-stack.yml`.
- **Reason:** Phương án thay thế tạo thêm một image và một deployable để chạy đúng cùng một đoạn code đã có sẵn trong `report-service`, trong khi ADR-003 chưa yêu cầu bật ETL ở production và bản thân `report-service` cũng chưa được deploy. Nó cũng làm nặng thêm disk Docker (đã là ràng buộc trong `docker-vhdx-disk.mdc`). Khi nhu cầu scale ETL riêng xuất hiện thật, tiền lệ `webhook-delivery-worker` cho thấy cách rẻ hơn là chạy lại cùng image với `command` + env khác, không cần package Node thứ hai.

### 6.3 Security

Không đụng authn/authz, không đụng secret, không đụng token nội bộ, không thêm log. Plan chỉ xóa code chết và sửa README, nên **không** cần `check-security-env.sh` hay `security-regression-smoke.md`.

### 6.4 Rollback

`git revert` commit xóa là đủ khôi phục nguyên trạng. Không có DB migration, không có feature flag phải hạ, không có service đang chạy phải redeploy — vì package bị xóa chưa từng được build hay deploy ở bất kỳ môi trường nào.

### 6.5 Observability

N/A — không đụng runtime đang chạy. Khi nào ETL thật sự được bật, log hiện có (`[analyticsEtl] consumer started` / `[analyticsEtl] fail`) và hàng đợi `ANALYTICS_ETL_DLQ` là điểm quan sát; plan này không thay đổi chúng.
