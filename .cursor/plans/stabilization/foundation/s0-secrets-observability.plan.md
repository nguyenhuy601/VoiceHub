---
name: s0-secrets-observability
overview: "S0 — Nền tảng staging: secrets, health, observability baseline, rollback runbook. Tiền đề bắt buộc trước mọi plan security/realtime."
todos:
  - id: rotate-secrets
    content: Rotate JWT, GATEWAY_INTERNAL_TOKEN, REALTIME_INTERNAL_TOKEN, CHAT_INTERNAL_TOKEN, Redis/Rabbit password trên staging
    status: completed
  - id: check-security-env
    content: Chạy bash devops/scripts/check-security-env.sh — pass 100%
    status: completed
  - id: observability-baseline
    content: Ghi docs/perf-baseline-staging-YYYY-MM.md theo devops/swarm/observability-baseline.md
    status: completed
  - id: rollback-runbook
    content: Document lệnh rollback từng service Swarm
    status: completed
isProject: false
---

# S0 — Secrets & Observability Baseline

**Phụ thuộc:** Không  
**Tiếp theo:** [security/s1-chat-idor-dm.plan.md](../security/s1-chat-idor-dm.plan.md)  
**Tiêu chí:** Ổn định

## 1. Mục tiêu & phạm vi

### Done
- Staging `.env` / stack secrets không còn giá trị default (`your-secret-key`, v.v.)
- `check-security-env.sh` pass
- File baseline metric tồn tại (`docs/perf-baseline-staging-*.md`)
- Runbook rollback ghi trong `devops/swarm/` hoặc PR description

### In-scope
- [`docker-stack.yml`](../../../docker-stack.yml), root `.env`, staging secrets
- [`devops/scripts/check-security-env.sh`](../../../devops/scripts/check-security-env.sh)
- [`devops/swarm/observability-baseline.md`](../../../devops/swarm/observability-baseline.md)

### Out-of-scope
- Scale replica, HA infra Phase 2
- Sửa application code

## 2. Files affected

| Tạo/sửa | Không đụng |
|---------|------------|
| `.env` (staging), `docs/perf-baseline-staging-*.md` | Service business logic |
| `devops/swarm/rollback-runbook.md` (mới, tùy chọn) | `api-gateway` auth flow |

## 3. Thiết kế & trách nhiệm

| Thành phần | Trách nhiệm |
|------------|-------------|
| DevOps | Rotate secrets đồng bộ mọi service trong stack |
| Gateway | Đã fail-fast JWT prod — verify env staging khớp |
| Mọi service | `/health` hoặc tương đương phản hồi 200 |

**Metric baseline tối thiểu:** desired vs running tasks, queue depth RabbitMQ (5 queue trong observability-baseline), p95 gateway boot/dashboard.

## 4. Thứ tự triển khai

1. Inventory secrets hiện tại — liệt kê biến bắt buộc từ `check-security-env.sh`
2. Rotate và redeploy stack (`devops/swarm/deploy-stack.sh`)
3. Chạy script security env — fix đến khi pass
4. Snapshot metric (lệnh trong observability-baseline.md) → ghi file baseline
5. Viết rollback: `docker service update --rollback voicehub_<service>`

**Lưu ý:** Không tăng `SOCKET_SERVICE_REPLICAS` hoặc gateway replicas trong S0.

## 5. Test plan

```bash
bash devops/scripts/check-security-env.sh
docker stack services voicehub
docker stack ps voicehub --no-trunc
```

- Mỗi service critical: `curl` health qua gateway hoặc nội bộ
- Login smoke sau rotate JWT (token mới, token cũ → 401)

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Rotate JWT đứt session hàng loạt | Chấp nhận trên staging; thông báo team | Redeploy env cũ (chỉ staging) |
| Thiếu sync token nội bộ | Deploy đồng thời gateway + chat + socket | `docker service update --rollback` từng service |
