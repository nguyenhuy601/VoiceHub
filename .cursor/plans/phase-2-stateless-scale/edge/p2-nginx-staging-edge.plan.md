---
name: p2-nginx-staging-edge
overview: P2-Edge — Nginx TLS staging (voicehub.local); TRUST_PROXY; client same-origin.
todos:
  - id: nginx-edge-deploy
    content: staging-swarm-edge.conf + dev-https verify script
    status: completed
  - id: client-env-lan
    content: VITE_* HMR/API same-origin qua Nginx (wave-1b rules)
    status: completed
  - id: edge-smoke
    content: verify-lan-https.ps1 pass từ máy LAN
    status: completed
isProject: false
---

# P2-Edge — Nginx Staging TLS

**Phụ thuộc:** [p2-voice-udp-strategy](../voice/p2-voice-udp-strategy.plan.md)  
**Tiếp theo:** [observability/p2-prometheus-metrics.plan.md](../observability/p2-prometheus-metrics.plan.md)  
**Tiêu chí:** Edge TLS staging (optional nhưng khuyến nghị trước validation)

## 1. Mục tiêu & phạm vi

### Done
- HTTPS `https://voicehub.local` (hoặc staging hostname) qua Nginx
- API `/api`, WS `/socket.io` proxy tới gateway
- Client `.env` same-origin (`VITE_API_URL=/api`)

### In-scope
- [`devops/nginx/staging-swarm-edge.conf`](../../../devops/nginx/staging-swarm-edge.conf)
- [`docs/lan-https-voicehub.local.md`](../../../docs/lan-https-voicehub.local.md)
- [`devops/nginx/verify-lan-https.ps1`](../../../devops/nginx/verify-lan-https.ps1)

### Out-of-scope
- Cloudflare (Phase 5)
- Production cert automation (Let's Encrypt prod)

## 2. Files affected

| Sửa | Không đụng |
|-----|------------|
| `devops/nginx/dev-https.conf` | JWT/auth flow |
| Client `.env` HMR vars | Microservice internal URLs |

## 3. Thiết kế & trách nhiệm

**Canonical path (S2):** WS qua gateway + Redis adapter — **không** bắt buộc socket sticky ([`staging-nginx-edge.md`](../../../devops/swarm/staging-nginx-edge.md)).

| Check | Giá trị |
|-------|---------|
| `TRUST_PROXY` | `1` api-gateway |
| `VITE_SOCKET_USE_GATEWAY` | `true` |
| Sticky | Chỉ nếu bypass gateway tới socket trực tiếp |

## 4. Thứ tự triển khai

1. Deploy Swarm stack (gateway 2+ replica)
2. Cấu hình Nginx upstream → gateway:3000
3. Client hosts file LAN
4. `verify-lan-https.ps1`
5. 2 máy LAN — login + DM realtime

## 5. Test plan

```bash
bash devops/nginx/verify-lan-https.ps1 -BaseUrl https://voicehub.local
```

- HMR wss qua Nginx
- Voice signaling qua `/api` (UDP vẫn host)

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| WS break qua proxy | Gateway path + adapter | Direct :3000 dev only |
| Cert trust LAN | Self-signed + doc hosts | HTTP localhost dev |
