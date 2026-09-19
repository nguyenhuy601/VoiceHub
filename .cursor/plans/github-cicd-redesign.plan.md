# Plan: GitHub CI/CD chuẩn — VoiceHub (Software Delivery Lifecycle)

## 0. Mô hình chuẩn (SoT)

Mọi thiết kế workflow **phải** bám chuỗi này — không rút gọn thành “chỉ push image”:

```text
Developer push / PR
       ↓
┌──────────────── CI ────────────────┐
│  Lint → Unit/Integration → Build   │
│  → Security Scan                   │
└────────────────┬───────────────────┘
                 │ PASS
                 ↓
            Artifact
         (GHCR :sha)
                 ↓
┌──────────────── CD ────────────────┐
│  Deploy Dev      → Smoke / E2E     │
│  Deploy Staging  → Smoke (+ approve)│
│  Deploy Production → Monitor       │
│  Rollback khi fail                 │
└────────────────────────────────────┘
```

| Thành phần | VoiceHub mapping |
|------------|------------------|
| Git | GitHub `main` + PR |
| CI | `.github/workflows/ci.yml` |
| Build / Artifact | Docker image, context **repo root**, tag `:sha` (+ `:latest` trên main) |
| Registry | `ghcr.io/<owner>/voicehub/<service>` |
| CD Dev | Swarm máy dev / LAN (`SWARM_USE_LOCAL_IMAGES` hoặc pull GHCR) |
| CD Staging | Swarm staging + `VOICEHUB_ENV_CHECK=staging` + `rebuild-deploy-staging.sh` |
| CD Prod | Swarm/prod (khi có) — **bắt buộc approval** |
| Test sau deploy | Smoke scripts (`smoke-*.js`, `voice-staging-smoke.md`, LAN verify) |
| Rollback | `devops/swarm/rollback-runbook.md` |

**Phân biệt Delivery vs Deployment**

- **Continuous Delivery (bắt buộc Wave 1):** CI PASS → artifact luôn sẵn trên GHCR; deploy env có **cổng kiểm soát** (GitHub Environment + approval).
- **Continuous Deployment (Wave 2+, tùy env):** sau approve, runner tự `deploy-stack` / `service update` trên Swarm **của env đó** — **không** tự đụng Swarm Docker Desktop của developer trừ khi máy đó đăng ký self-hosted runner có chủ đích.

---

## 1. Mục tiêu & phạm vi

### 1.1 Objective

- **Type:** Architecture / DevEx
- **Business reason:** Pipeline kiểm soát toàn SDLC (không chỉ “đóng gói image”).
- **Technical reason:** Workflow cũ / bản redesign trước **thiếu** scan + thiếu tầng CD theo env (Dev → Staging → Prod); build context từng sai repo root.
- **Expected outcome:** Một plan + workflow bám sơ đồ §0; triển khai theo wave đo được.

### 1.2 Success Criteria — Definition of Done

**Wave 1 — CI + Artifact + CD gates (implement ngay)**

- [ ] PR: CI chạy đủ nhóm **Lint | Test | Build | Scan**; job tổng `CI gate` fail nếu bất kỳ bắt buộc fail.
- [ ] Scan tối thiểu: secret scan (gitleaks) + image/fs scan (Trivy) trên artifact/build path; `check-security-env.sh` profile `ci`.
- [ ] `main` sau CI PASS: publish artifact GHCR `:sha` (và `:latest`); **context = `.`**.
- [ ] CD có 3 GitHub Environment: `development`, `staging`, `production` — job deploy **không** chạy ngầm không cổng; staging/prod cần approval (cấu hình trên GitHub UI).
- [ ] Job deploy in rõ tag `:sha`, lệnh smoke, lệnh rollback; nếu **chưa** có self-hosted runner / deploy secret → job **không** giả vờ success deploy (kết luận `skipped` / `awaiting runner` rõ ràng).
- [ ] Swarm local developer **không** bị `service update` từ `ubuntu-latest` remote.

**Wave 2 — CD Staging thật (khi có runner/host)**

- [ ] Self-hosted runner label `voicehub-swarm-staging` (hoặc SSH secret được approve) kéo `:sha` và chạy deploy staging + smoke.
- [ ] Fail smoke → không promote prod; có bước rollback documented/automated tối thiểu.

**Wave 3 — Prod**

- [ ] Environment `production` + required reviewers; deploy chỉ từ tag/sha đã qua staging; monitoring checklist sau deploy.

### 1.3 In-Scope

- Viết lại plan này (chuẩn §0).
- Wave 1 workflows: `ci.yml` (đủ 4 nhóm), `cd.yml` (Artifact → Deploy env gates).
- SoT matrix `.github/swarm-app-images.json`.
- Gỡ workflow lệch chuẩn (`cd-publish.yml` / `cd-deploy.yml` stub cũ → gộp `cd.yml`).

### 1.4 Out-of-Scope (Wave 1)

- Tự SSH vào Docker Desktop LAN của developer không qua self-hosted runner.
- Compose extra (ollama/minio/voice workers).
- `report-service` / `report-etl-worker` chưa có trong `resolve-swarm-images`.
- Đổi auth/JWT/gateway policy, product code, commit `.env`.
- Bật branch protection / Environment protection rules trên GitHub UI (user cấu hình tay theo checklist §4).

---

## 2. Files Affected

### 2.1 CREATE / REPLACE

- `.github/workflows/cd.yml` — CD: Artifact → Deploy Dev/Staging/Prod (gates)
- `.cursor/plans/github-cicd-redesign.plan.md` — **rewrite** (file này)

### 2.2 MODIFY

- `.github/workflows/ci.yml` — bổ sung **Scan**; đặt tên job theo Lint | Test | Build | Scan | Gate
- `.github/swarm-app-images.json` — giữ SoT (đã khớp `build-local-images.sh`)

### 2.3 DELETE

- `.github/workflows/cd-publish.yml`
- `.github/workflows/cd-deploy.yml`
- `.github/workflows/swarm-images.yml` (nếu còn)

### 2.4 DO NOT MODIFY

- `docker-stack.yml`, product services, `client/` source (chỉ lint/build trong CI)
- Auth / gateway trust
- `.env` secrets trên runner (không upload)

### 2.5 Dependency / Impact

```text
PR ──► CI (Lint/Test/Build/Scan) ──► status check
main ──► CI PASS ──► CD Artifact (GHCR :sha)
                  ├─► Environment development  (manual / runner)
                  ├─► smoke
                  ├─► Environment staging      (approval)
                  ├─► smoke
                  └─► Environment production   (approval)  [Wave 3]
```

Blast radius Wave 1: GitHub Actions + GHCR. Runtime Swarm chỉ đổi khi operator/runner env tương ứng chạy deploy.

### 2.6 Nguồn dữ liệu

N/A — không đụng API browser.

---

## 3. Thiết kế & trách nhiệm module

### 3.1 CI — Continuous Integration

| Job nhóm | Việc | Fail = chặn |
|----------|------|-------------|
| **Lint** | `client`: `npm run lint` (+ build khi `client/**`) | Có |
| **Test** | `node --test` shared; api-gateway; services đổi (path filter) | Có |
| **Build** | `docker build` context `.` **không push** (verify Dockerfile) | Có (PR) |
| **Scan** | gitleaks; Trivy fs (HIGH/CRITICAL); `VOICEHUB_ENV_CHECK=ci` | Có (gitleaks + env); Trivy: fail HIGH/CRITICAL |
| **CI gate** | Aggregate — required check cho branch protection | Có |

### 3.2 Artifact

- Chỉ sau CI PASS trên `main` (job `needs: ci-gate` trong cùng workflow CD, hoặc `workflow_run` types completed success).
- Tag bất biến: `:sha`; `:latest` = pointer tiện lợi (deploy prod **ưu tiên `:sha`**).

### 3.3 CD — Continuous Delivery / Deployment theo env

| Env | GitHub Environment | Hành vi Wave 1 | Hành vi Wave 2+ |
|-----|--------------------|----------------|-----------------|
| development | `development` | Guide + optional self-hosted `voicehub-swarm-dev` | Auto/manual deploy local/dev Swarm |
| staging | `staging` | Approval + guide / awaiting runner | Pull GHCR `:sha` + `deploy-stack` + smoke |
| production | `production` | Approval + guide only | Deploy prod + monitor |

**RULE-01** Build context luôn repo root.  
**RULE-02** Remote `ubuntu-latest` không `docker service update` vào máy dev.  
**RULE-03** `shared/**` đổi → rebuild all Swarm app images.  
**RULE-04** Promote env chỉ theo `:sha` đã publish (không build lại khác nội dung trên prod).  
**RULE-05** Smoke fail trên staging → không chạy job production.

### 3.4 Smoke / Rollback (tham chiếu có sẵn)

- Smoke: `devops/scripts/smoke-single-company.js`, `devops/scripts/check-security-env.sh` (staging), `devops/nginx/verify-lan-https.ps1`, voice staging smoke docs.
- Rollback: `devops/swarm/rollback-runbook.md`.

---

## 4. Thứ tự triển khai

### Step 1 — Plan chuẩn (§0–§6) — **DONE (rewrite)**

### Step 2 — CI đủ 4 nhóm + gate

- File: `ci.yml`
- Expected: Lint/Test/Build/Scan/Gate
- **Review Gate:** sau Step 2 có thể stop nếu cần review scan policy.

### Step 3 — CD gộp Artifact + Environments

- File: `cd.yml`; xóa `cd-publish.yml`, `cd-deploy.yml`
- Expected: job `artifact` → `deploy-development` → `deploy-staging` → `deploy-production` (needs + environment)

### Step 4 — GitHub UI (user)

1. Settings → Environments: tạo `development`, `staging`, `production`.
2. `staging` / `production`: Required reviewers.
3. Branch protection `main`: require **CI gate**.
4. (Wave 2) Đăng ký self-hosted runner labels.

### Step 5 — Wave 2 wire staging runner (plan riêng khi có host)

- Implement step chỉ khi user có runner/staging host.

---

## 5. Test plan

| Id | Layer | Command / check | Pass |
|----|-------|-----------------|------|
| T1 | Unit | `node --test shared/tests/singleCompany.test.js` | exit 0 |
| T2 | Security CI | `VOICEHUB_ENV_CHECK=ci bash devops/scripts/check-security-env.sh` | exit 0 |
| T3 | SoT | JSON matrix length = images trong `build-local-images.sh` | equal |
| T4 | Pipeline shape | `ci.yml` có Lint/Test/Build/Scan/Gate; `cd.yml` có Artifact + 3 env jobs | grep/name |
| T5 | No rogue deploy | `ubuntu-latest` jobs không gọi `docker service` / `stack deploy` | grep |
| T6 | Manual GH | PR đỏ khi test fail; main publish `:sha`; deploy job chờ Environment | UI |

---

## 6. Risk & trade-off

| Risk | Impact | Prob | Mitigation | Fallback |
|------|--------|------|------------|----------|
| Trivy noise | CI đỏ | Med | Fail chỉ CRITICAL/HIGH; severity tune | Tạm `continue-on-error` **cấm** trên gitleaks |
| Chưa có staging host | CD “treo” ở guide | High (hiện tại) | Wave 1 = Delivery + gates; Wave 2 wire runner | Deploy tay bằng `rebuild-deploy-staging.sh` |
| `:latest` drift | Sai version prod | Med | Prod/staging pin `:sha` | Rollback runbook |
| Full matrix khi shared đổi | Lâu / quota | Med | Path filter + Buildx cache | `workflow_dispatch` 1 image |

### Decision

| Option | Reason |
|--------|--------|
| Chọn **Delivery chuẩn + env gates**, Deployment thật theo wave | Khớp sơ đồ §0 mà không phá Swarm local |
| Không gộp “publish = xong CD” | Tránh hiểu sai CI/CD như bản trước |
| Không SSH mặc định vào LAN | Bảo mật + Docker Desktop không phải server CD |

### Rollback

- Revert workflows; GHCR giữ `:sha` cũ; Swarm không đổi nếu chưa ai deploy.

### Observability

- GitHub Actions annotations + Environment deployment history; sau Wave 2: smoke exit code + (optional) stack health.
