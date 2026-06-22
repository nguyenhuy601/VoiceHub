# P2-Edge — Nginx TLS staging (Swarm)

**Docs:** [`docs/lan-https-voicehub.local.md`](../../docs/lan-https-voicehub.local.md)  
**Smoke:** `bash devops/swarm/run-p2-nginx-edge-smoke.sh`

## Khi nào dùng

| Config | Use case |
|--------|----------|
| [`dev-https.conf`](../nginx/dev-https.conf) | Dev LAN + Vite HMR (`https://voicehub.local`) |
| [`staging-swarm-edge.conf`](../nginx/staging-swarm-edge.conf) | Chỉ API/WS qua gateway (không Vite) |

## Triển khai (P2)

1. Swarm stack với `API_GATEWAY_REPLICAS>=2` (`bash devops/swarm/deploy-stack.sh`).
2. `api-gateway/.env`: **`TRUST_PROXY=1`** (bắt buộc khi TLS tại Nginx).
3. mkcert: `powershell -File devops/nginx/mkcert-setup.ps1`.
4. Hosts: `127.0.0.1 voicehub.local` (máy dev) — xem `print-lan-hosts-hint.ps1`.
5. Client `client/.env`: `VITE_API_URL=/api`, `VITE_SOCKET_USE_GATEWAY=true`, HMR `wss` qua :443.
6. Chạy Nginx:
   - Dev: `devops/nginx/start-lan-https-dev.bat`
   - API-only: `nginx -p devops/nginx -c staging-swarm-edge.conf`
7. Verify:
   ```powershell
   powershell -File devops\nginx\verify-lan-https.ps1 -BaseUrl https://voicehub.local
   ```
   ```bash
   bash devops/swarm/run-p2-nginx-edge-smoke.sh
   ```

## Socket sticky

[`swarm-socket-sticky.conf`](../nginx/swarm-socket-sticky.conf) — chỉ khi Nginx proxy **trực tiếp** `socket-service:3017`.

**S2 canonical:** WS qua gateway + `SOCKET_IO_REDIS_ADAPTER=true` → sticky **không bắt buộc**.

## Rollback

- Tắt Nginx; dev qua `http://localhost:5173` + proxy Vite (không mic secure context).
- Giữ `TRUST_PROXY=1` — không gây hại khi truy cập trực tiếp `:3000`.
