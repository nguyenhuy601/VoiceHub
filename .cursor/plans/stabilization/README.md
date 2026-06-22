# Stabilization Plans — VoiceHub

Lộ trình **ổn định hệ thống cũ** (staging Docker Swarm) trước khi scale/edge/K8s.

## Bắt đầu tại

**[00-master-index.plan.md](./00-master-index.plan.md)**

## Cấu trúc

| Thư mục | Plans | Tiêu chí |
|---------|-------|----------|
| `foundation/` | s0-secrets-observability | Ổn định |
| `security/` | s1-chat-idor-dm, s1-internal-tokens, s1-gateway-permissions, s1-p1-p2-backlog | An toàn |
| `realtime/` | s2-socket-canonical | Thống nhất |
| `operations/` | s3-realtime-ha-chaos | Ổn định |
| `cleanup/` | s4-gateway-legacy, s4-api-pagination-client, s4-docs-alignment | Sạch + Thống nhất |

## Thứ tự

```
S0 → S1a → S1b → S1c → S2 → S3 → S4a → S4b → S4c
```

## Vị trí Phase 0–5 (hạ tầng)

| Phase | Stabilization |
|-------|---------------|
| 0 Baseline | S0 — đầy đủ |
| 1 Stateful HA | Không — sau sign-off |
| 2 Stateless scale | S3 — một phần (socket) |
| 3 Edge TLS | S3 — optional |
| 4–5 Gateway/CF | Không |

Chi tiết + sơ đồ: [00-master-index.plan.md § Vị trí trong roadmap Phase 0–5](./00-master-index.plan.md).

Mỗi file `.plan.md` có đủ 6 phần: mục tiêu, files, thiết kế, thứ tự triển khai, test, risk.
