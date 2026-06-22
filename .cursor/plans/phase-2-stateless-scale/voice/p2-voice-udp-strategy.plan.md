---
name: p2-voice-udp-strategy
overview: P2-Voice — Chiến lược scale voice-service với UDP host mode trên Swarm.
todos:
  - id: voice-constraints-doc
    content: Document UDP ports 40000-40010 host mode + node.labels.voice
    status: completed
  - id: voice-smoke-2user
    content: 2 user call smoke trên staging
    status: completed
  - id: voice-replica-decision
    content: Quyết định VOICE_SERVICE_REPLICAS=1 vs multi-node strategy
    status: completed
isProject: false
---

# P2-Voice — UDP & Scale Strategy

**Phụ thuộc:** [p2-worker-replicas-autoscale](../workers/p2-worker-replicas-autoscale.plan.md)  
**Tiếp theo:** [edge/p2-nginx-staging-edge.plan.md](../edge/p2-nginx-staging-edge.plan.md)  
**Tiêu chí:** Voice scale strategy (documented + smoke)

## 1. Mục tiêu & phạm vi

### Done
- Chiến lược replica voice documented (UDP host binding)
- 2-user voice call smoke pass trên staging
- `node.labels.voice=true` placement verified

### In-scope
- [`docker-stack.yml`](../../../docker-stack.yml) `voice-service` ports UDP host mode
- [`services/voice-service/`](../../../services/voice-service/)

### Out-of-scope
- TURN/STUN cloud managed
- Scale voice >1 trên cùng node (port conflict)

## 2. Files affected

| Tạo/sửa | Không đụng |
|---------|------------|
| `docs/voice-swarm-scale-strategy.md` | Mediasoup core refactor |
| `devops/swarm/voice-staging-smoke.md` | Gateway WS path |

## 3. Thiết kế & trách nhiệm

Voice dùng **UDP published host mode** (40000–40010) — mỗi replica trên **node khác** nếu scale >1.

| Option | Khi nào |
|--------|---------|
| `VOICE_SERVICE_REPLICAS=1` | Staging default — đủ smoke |
| Multi-replica | Chỉ khi ≥2 node `voice=true`, port range không conflict |
| Client routing | Qua gateway HTTP signaling; media UDP tới node host |

## 4. Thứ tự triển khai

1. Inventory node labels `voice`
2. Document port range per node
3. Smoke 2 user cùng lobby/channel
4. Ghi quyết định replica staging (thường giữ 1)
5. Link vào Phase 2 validation checklist

## 5. Test plan

- 2 browser voice join — audio OK
- Restart voice task — client reconnect
- Không expose socket-service public (S2)

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| UDP port clash multi replica | Staging replica=1 | Single voice node |
| LAN NAT | Document dev LAN hosts | Nginx không proxy UDP |
