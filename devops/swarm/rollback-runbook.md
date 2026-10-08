# Swarm Rollback Runbook (S0)

> Stack mặc định: `voicehub` — đổi `STACK` nếu deploy tên khác.

## Rollback theo Release Manifest (ưu tiên STG/PROD)

SoT: GitHub Release tag `voicehub-<releaseId>` + asset `release-manifest.json` (17 digests).  
**Không** `docker build` khi rollback. **Không** promote bằng `:latest`.

```bash
# Ví dụ: R101 lỗi → quay về R100
bash devops/swarm/deploy-release.sh --release-id R20261007-100 --env staging

# Hoặc file đã tải sẵn
bash devops/swarm/deploy-release.sh --manifest ./release-manifest.json --env production

# Dry-run (chỉ resolve image env)
bash devops/swarm/deploy-release.sh --release-id R20261007-100 --dry-run
```

Sau deploy: health + smoke (`curl` gateway-trust, `smoke-single-company.js` nếu có).

Xem thêm: [`docs/ci-cd-release-manifest.md`](../../docs/ci-cd-release-manifest.md)

## Khi nào rollback

| Triệu chứng | Hành động ưu tiên |
|-------------|-------------------|
| API 5xx spike > 5 phút | Redeploy previous **releaseId** (manifest) hoặc rollback service vừa deploy |
| Realtime disconnect hàng loạt | Rollback `socket-service`, kiểm tra Redis adapter |
| Queue backlog không drain > 10 phút | Scale worker hoặc rollback worker image |
| Gateway 401/503 sau rotate secret | Redeploy đồng bộ env hoặc rollback gateway + auth |

## Lệnh rollback (một service — Swarm history)

```bash
STACK=voicehub
docker service update --rollback "${STACK}_api-gateway"
docker service update --rollback "${STACK}_socket-service"
docker service update --rollback "${STACK}_chat-service"
docker service update --rollback "${STACK}_auth-service"
```

## Danh sách service (Plan A stack)

| Service Swarm | Rollback command |
|---------------|------------------|
| api-gateway | `docker service update --rollback voicehub_api-gateway` |
| auth-service | `docker service update --rollback voicehub_auth-service` |
| user-service | `docker service update --rollback voicehub_user-service` |
| organization-service | `docker service update --rollback voicehub_organization-service` |
| friend-service | `docker service update --rollback voicehub_friend-service` |
| role-permission-service | `docker service update --rollback voicehub_role-permission-service` |
| chat-service | `docker service update --rollback voicehub_chat-service` |
| project-service | `docker service update --rollback voicehub_project-service` |
| project-worker | `docker service update --rollback voicehub_project-worker` |
| ai-task-service | `docker service update --rollback voicehub_ai-task-service` |
| ai-task-extract-worker | `docker service update --rollback voicehub_ai-task-extract-worker` |
| ai-task-sync-worker | `docker service update --rollback voicehub_ai-task-sync-worker` |
| document-service | `docker service update --rollback voicehub_document-service` |
| voice-service | `docker service update --rollback voicehub_voice-service` |
| notification-service | `docker service update --rollback voicehub_notification-service` |
| notification-dispatch-worker | `docker service update --rollback voicehub_notification-dispatch-worker` |
| socket-service | `docker service update --rollback voicehub_socket-service` |

## Rollback sau rotate secrets

1. Khôi phục `.env` / `api-gateway/.env` / `services/auth-service/.env` từ backup local.
2. `docker stack deploy -c docker-stack.yml voicehub` (env_file đọc lại từ disk trên manager node).
3. Login smoke — token cũ có thể vẫn 401 nếu JWT đã đổi (chấp nhận trên staging).

## Kiểm tra sau rollback

```bash
docker stack services voicehub
docker stack ps voicehub --no-trunc | head -30
curl -sS http://localhost:3000/health
curl -sS http://localhost:3000/api/health/gateway-trust
```

## Rollback toàn stack (khẩn cấp)

```bash
# Chỉ khi stack corrupt — mất task tạm thời
docker stack rm voicehub
# Chờ drain, redeploy từ image/tag đã biết ổn định
bash devops/swarm/deploy-stack.sh
```

## Phase 1 infra rollback

Stateful HA cutover (Atlas + Sentinel + Rabbit cluster): [`phase1-rollback.md`](./phase1-rollback.md) — `STACK_FILE=docker-stack.plan-a.yml`

## Liên quan

- [cutover-runbook.md](./cutover-runbook.md) — deploy order & canary
- [phase1-rollback.md](./phase1-rollback.md) — Plan A full rollback
- [realtime-ha-checklist.md](./realtime-ha-checklist.md) — sau rollback socket
- [observability-baseline.md](./observability-baseline.md) — metric so sánh
