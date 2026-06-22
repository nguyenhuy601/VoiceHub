# Voice Staging Smoke (P2-Voice)

**Automated:** `bash devops/swarm/run-p2-voice-smoke.sh`  
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
# Giảm tải tạm trên single-node 14GB
bash devops/swarm/scale-workers.sh down
docker service scale voicehub_ollama=0 voicehub_paddleocr-service=0
docker service update --force voicehub_voice-service
docker service ps voicehub_voice-service
```

## A. Automated (script)

```bash
bash devops/swarm/run-p2-voice-smoke.sh
node tests/p2-voice-swarm-strategy.smoke.js
```

Pass khi: health OK, 2 session signaling polling, node label, UDP host ports, socket-service không public, restart voice → health OK.

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

## Sign-off

| Check | Pass | Ngày | Operator |
|-------|------|------|----------|
| Automated script | ☐ | | |
| 2-user audio (B1/B2/B3) | ☐ | | |
| Restart reconnect (C) | ☐ | | |
| socket-service not public (D) | ☐ | | |

Ghi kết quả vào `docs/phase2-replica-inventory-staging.md` section P2-Voice.
