# Voice Staging Smoke (P2-Voice)

**Checklist thủ công** — script phase đã gỡ.  
**Strategy:** [`docs/voice-swarm-scale-strategy.md`](../../docs/voice-swarm-scale-strategy.md)

## Tiền đề

| Item | Expected |
|------|----------|
| `voicehub_voice-service` | **1/1** Running |
| Node label | `voice=true` trên node chạy task |
| Gateway | `http://localhost:3000` hoặc `https://voicehub.local` |
| Firewall | UDP **40000–40010** mở trên IP LAN (`MEDIASOUP_ANNOUNCED_IP`) |
| `.env` voice | `MEDIASOUP_ANNOUNCED_IP` = IP LAN PC (không `127.0.0.1` trong Docker) |

### Nếu voice Pending (insufficient resources)

```bash
bash devops/swarm/scale-workers.sh down
docker service scale voicehub_ollama=0 voicehub_paddleocr-service=0
docker service update --force voicehub_voice-service
docker service ps voicehub_voice-service
```

## A. Automated checks (curl)

```bash
curl -sf http://127.0.0.1:3000/health
curl -sf http://127.0.0.1:3005/health
docker service ps voicehub_voice-service --no-trunc
docker node inspect self --format '{{json .Spec.Labels}}' | grep voice
```

Pass khi: health OK, task Running, label `voice=true`, `curl http://localhost:3017/health` **fail** (socket không publish host).

## B. Manual — 2 user voice call (bắt buộc sign-off)

Chọn **một** luồng:

### B1. Friend call 1-1 (khuyến nghị — nhanh)

1. **Browser A:** login user A → mở chat DM với user B → **Gọi thoại** (FriendCall).
2. **Browser B:** login user B → **Nhận cuộc gọi** → Accept.
3. **Verify:** cả hai nghe được audio; mute/unmute hoạt động; hangup đóng call.
4. **DevTools → Network:** signaling qua `/voice-socket` (gateway), không `:3017` socket-service.

### B2. Org voice channel

1. **Browser A + B:** cùng org → vào **kênh voice** (`OrganizationsPage` / voice channel).
2. Join channel → icon mic → nói thử.
3. **Verify:** avatar viền sáng khi nói (speaking indicator); nghe được đối phương.

### B3. Voice room (public lobby)

1. Mở `/voice/room/:roomId` (2 user có mã/link).
2. Prejoin → Join → audio 2 chiều.

## C. Restart resilience

1. Trong khi 2 user đang trong call/channel:
   ```bash
   docker service update --force voicehub_voice-service
   ```
2. **Verify:** client reconnect signaling (Socket.IO); join lại room nếu cần; không crash gateway/socket-service.

## D. Security (S2)

- [ ] `curl http://localhost:3017/health` **fail** (connection refused — socket không publish host)
- [ ] Chat realtime vẫn qua gateway `/socket.io`, không duplicate voice socket trên chat-service

## P4 — Multi-node WAIVE (1-node dev)

| Item | Expected |
|------|----------|
| Swarm nodes | **1** (`docker-desktop`) |
| `VOICE_SERVICE_REPLICAS` | **1** — không scale >1 cùng node |
| Multi-node smoke | **WAIVE** — tick [single-node-dev-profile.md](../../docs/single-node-dev-profile.md) §P4 |

Khi có VPS thứ 2: xem [voice-swarm-scale-strategy.md](../../docs/voice-swarm-scale-strategy.md) Option B.

## P5 — Internet A/V (CF staging / production)

1. `MEDIASOUP_ANNOUNCED_IP` = WAN IP — [phase5-voice-udp.md](../../docs/phase5-voice-udp.md)
2. Firewall UDP 40000–40010 — `devops/scripts/voice-udp-firewall-linux.sh`
3. Smoke: [phase5-voice-internet-smoke.md](../../docs/phase5-voice-internet-smoke.md)

**1-node Docker Desktop:** **WAIVE** internet 2-user — dùng §B LAN.

## Sign-off

| Check | Pass | Ngày | Operator |
|-------|------|------|----------|
| Health + label (§A) | ☐ | | |
| 2-user audio (B1/B2/B3) | ☐ WAIVE G3 | | Optional LAN |
| Restart reconnect (C) | ☐ | | |
| socket-service not public (D) | ☐ | | |
| Multi-node WAIVE | ☑ | 2026-06-25 | 1-node profile |

Ghi kết quả vào `docs/phase2-replica-inventory-staging.md` section P2-Voice.
