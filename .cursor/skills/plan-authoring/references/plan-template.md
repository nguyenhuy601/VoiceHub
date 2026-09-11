# VoiceHub Plan Template (Plan Standard)

Copy and fill. Do not omit Out-of-Scope, DO NOT MODIFY, Pass Criteria, or Rollback.

---

## 1. Mục tiêu & phạm vi

### 1.1 Objective

- **Type:** Feature | Bug | Refactor | Security | Performance | Architecture
- **Business reason:**
- **Technical reason:**
- **Expected outcome:**

### 1.2 Success Criteria — Definition of Done

Measurable only (no “finish feature X”):

- [ ] …
- [ ] …

### 1.3 In-Scope

- …

### 1.4 Out-of-Scope

- …

---

## 2. Files Affected

### 2.1 CREATE

- …

### 2.2 MODIFY

- …

### 2.3 DELETE

- … (or “none”)

### 2.4 DO NOT MODIFY

- …

### 2.5 Dependency / Impact

```text
module-a
  ↓
module-b
  ↓
API / client / deploy surface
```

### 2.6 Nguồn dữ liệu

Bắt buộc khi plan đụng API / list / card / enrich payload (FE hoặc BE). Plan thuần UI copy / không gọi data: ghi «N/A — không đụng API».

#### Sinh request / route mới?

| Loại | Kết luận |
|------|----------|
| **HTTP public / browser** | Có / Không — nếu Có: method + path + lý do không gộp endpoint sẵn |
| **Route REST mới (service)** | Có / Không |
| **Query / S2S nội bộ (server-side)** | Không / Có (liệt kê; không expose public route) |

#### Client request (hiện có hoặc mới)

```http
METHOD /api/...?...
```

#### Nguồn gốc field → UI / response

| UI / consumer field | Field response | Nguồn gốc (Model / aggregate / membership / …) |
|---------------------|----------------|------------------------------------------------|
| … | … | … |

#### Payload response (shape)

- Envelope: `{ success, data }` / …
- Additive vs breaking: …
- Null-safe / fallback: …

```json
{ }
```

#### Tối ưu response (bắt buộc khi sinh / đổi payload)

Áp dụng khi plan **thêm field**, **enrich list**, hoặc **đổi shape** response trả browser (kể cả mở rộng endpoint sẵn). Mục tiêu: payload khớp UI surface — không dump document lean / nested thừa.

Điền checklist trong plan:

- [ ] **Whitelist field** — liệt kê field UI thật sự render; mọi field khác = omit (ghi rõ trong JSON mẫu hoặc cột «Omit»).
- [ ] **Không trả nested dư** — ví dụ chỉ cần `defaultBoardId` thì **không** embed `boards[]` đầy đủ; chỉ cần count thì không trả full membership rows.
- [ ] **View / projection opt-in** — ưu tiên query trên route sẵn (`view=card` | `fields=…`) thay vì luôn slim (tránh phá consumer khác) hoặc route REST mới.
- [ ] **Default backward-compatible** — thiếu `view` → behavior/payload cũ; consumer mới (landing/card) mới gửi view hẹp.
- [ ] **Enrich tối thiểu** — chỉ attach metric hiện trên UI (vd. `progressPercent` / `health` / `pm`); không kéo overview/WBS/budget lên list.
- [ ] **FE cache** — nếu có `view`/projection: đưa vào React Query key / fetch params để không trộn full vs slim.
- [ ] **So sánh kích thước (DoD)** — Success Criteria đo được: omit list cụ thể hoặc «body nhỏ hơn / không còn field X,Y,Z».

**Cấm trong plan sinh res:** trả `...doc` lean nguyên bản cho list/card; nhét Tier-3 (budget, config workflow, closureSnapshot, …) lên list khi UI không hiển thị.

Tham chiếu thiết kế API: Skill [`api-design`](../../api-design/SKILL.md) (mục Response shaping).

#### FE consume / round-trip

- Hook / API client: …
- Browser round-trip sau thay đổi: N (so với trước)

---

## 3. Thiết kế & trách nhiệm module

### 3.1 Architecture

```text
Route → Controller → Service → Repository/Model → DB / External
```

### 3.2 Responsibility

| Layer / Module | Responsibility | Must not |
|----------------|----------------|----------|
| Route | | |
| Controller | | |
| Service | | |
| … | | |

### 3.3 Data Flow

```text
Client → … → DB
```

### 3.4 Business Rules

- **RULE-01:** …
- **RULE-02:** …

### 3.5 Constraints

- No public API break / no schema change / … (as applicable)

---

## 4. Thứ tự triển khai

### 4.1 Dependency

```text
Step 1 → Step 2 → Step 3 → …
```

Why order matters: …

### 4.2 Steps

#### STEP 1 — …

- **Objective:**
- **Files:** READ ONLY | CREATE | MODIFY
- **Implementation:**
- **Dependencies:** none | Step …
- **Expected result:**
- **Validation:**

#### STEP 2 — …

(same fields)

### 4.3 Review Gates

- After Step …: **STOP.** Wait for reviewer approval.
- Phrase: `Implement step N only. Stop for review.`

---

## 5. Test Plan

### 5.1 Unit

- …

### 5.2 Integration

- …

### 5.3 Smoke

- …

### 5.4 Regression

- …

### 5.5 Mock / Fixture

- **Mock:** …
- **Fixture:** …

### 5.6 Commands

```bash
node --test shared/tests/<relevant>.test.js
node --test services/<service>/tests/<relevant>.test.js
cd client && npm run build
# if security:
bash devops/scripts/check-security-env.sh
```

### 5.7 Pass Criteria

- [ ] Unit: …
- [ ] Integration: …
- [ ] Smoke: …
- [ ] No regression failure
- [ ] …

---

## 6. Risk & trade-off

### 6.1 Risks

| Risk | Impact | Probability | Trigger | Mitigation | Fallback |
|------|--------|-------------|---------|------------|----------|
| Scope creep / agent edits outside Files Affected | Medium | Medium | Unexpected diff | Enforce §2.4 | Revert extras |
| … | | | | | |

### 6.2 Trade-off

- **Decision:**
- **Alternative:**
- **Reason:**

### 6.3 Security

- Token / authn / authz / logging / secrets / injection / rate limit (as relevant)
- After security fix: `bash devops/scripts/check-security-env.sh` + `devops/scripts/security-regression-smoke.md`

### 6.4 Rollback

- Revert commit / feature flag / DOWN migration / restore prior behavior

### 6.5 Observability (when touching sensitive runtime)

- Logging events:
- Metrics:
- Alerts (if any):
