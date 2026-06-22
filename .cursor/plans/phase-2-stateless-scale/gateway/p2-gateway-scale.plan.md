---
name: p2-gateway-scale
overview: P2-Gateway — Scale API Gateway 2+ replica; verify BFF cache stateless.
todos:
  - id: gateway-replicas
    content: API_GATEWAY_REPLICAS=2+ trong .env + rolling deploy
    status: completed
  - id: bff-cache-verify
    content: BFF bootstrap/shell cache qua Redis — hit/miss giữa replica
    status: completed
  - id: gateway-smoke
    content: Login + pagination + gateway-trust qua 2 replica
    status: completed
isProject: false
---

# P2-Gateway — API Gateway Scale

**Phụ thuộc:** [p2-prep-replica-baseline](../foundation/p2-prep-replica-baseline.plan.md)  
**Tiếp theo:** [workers/p2-worker-replicas-autoscale.plan.md](../workers/p2-worker-replicas-autoscale.plan.md)  
**Tiêu chí:** Stateless scale — gateway

## 1. Mục tiêu & phạm vi

### Done
- `API_GATEWAY_REPLICAS>=2` trên staging
- BFF cache (`bff:*` Redis) shared giữa replica — không session sticky
- Health + auth flow pass sau scale

### In-scope
- [`docker-stack.yml`](../../../docker-stack.yml) `api-gateway`
- [`api-gateway/src/bff/`](../../../api-gateway/src/bff/) cache
- Root `.env`: `API_GATEWAY_REPLICAS`, `BFF_*`

### Out-of-scope
- Cloudflare / WAF
- Scale auth-service (có thể Phase 2b nếu bottleneck)

## 2. Files affected

| Sửa | Verify |
|-----|--------|
| Root `.env` `API_GATEWAY_REPLICAS` | `GET /health`, `/api/health/gateway-trust` |
| `docker-stack.yml` (nếu cần update_config) | BFF bootstrap 2 lần — cache hit lần 2 |

## 3. Thiết kế & trách nhiệm

Gateway **stateless** — JWT verify per request; BFF dùng Redis (`BFF_CACHE_ENABLED`).

| Concern | Giải pháp |
|---------|-----------|
| Ingress LB | Swarm routing mode ingress — round robin |
| Sticky session | Không cần |
| Internal tokens | Đồng bộ `.env` (S1 đã làm) |

## 4. Thứ tự triển khai

1. Set `API_GATEWAY_REPLICAS=2` trong `.env`
2. `bash devops/swarm/deploy-stack.sh` hoặc `docker service scale voicehub_api-gateway=2`
3. Verify 2 tasks Running
4. Smoke login + BFF bootstrap (2 browser / refresh)
5. Monitor restart loop 10 phút

## 5. Test plan

```bash
curl -sS http://localhost:3000/health
curl -sS http://localhost:3000/api/health/gateway-trust
docker service ps voicehub_api-gateway
```

- Login + refresh token
- BFF cache hit (log hoặc Redis key TTL)

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| BFF cache miss storm | Redis Sentinel đã HA Phase 1 | `API_GATEWAY_REPLICAS=1` |
| DB connection spike | Scale gateway trước workers | `docker service update --rollback` |
