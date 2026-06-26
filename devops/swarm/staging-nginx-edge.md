# P2-Edge — Nginx TLS staging (Swarm)

**Docs:** [`docs/lan-https-voicehub.local.md`](../../docs/lan-https-voicehub.local.md)  
**Smoke:** curl — xem [OPERATIONS.md](./OPERATIONS.md#smoke-thủ-công)

## Khi nào dùng

| Config | Use case |
|--------|----------|
| [`dev-https.conf`](../nginx/dev-https.conf) | Dev LAN + Vite HMR (`https://voicehub.local`) |
| [`prod-edge.conf`](../nginx/prod-edge.conf) | **P3** Static `client/dist` + API/WS hardened |
| [`staging-swarm-edge.conf`](../nginx/staging-swarm-edge.conf) | Chỉ API/WS (legacy, không SPA) |

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
   ```bash
   BASE=https://voicehub.local
   curl -skf "$BASE/api/health"
   curl -skf "$BASE/socket.io/?EIO=4&transport=polling"
   ```

## Socket sticky

[`swarm-socket-sticky.conf`](../nginx/swarm-socket-sticky.conf) — chỉ khi Nginx proxy **trực tiếp** `socket-service:3017`.

**S2 canonical:** WS qua gateway + `SOCKET_IO_REDIS_ADAPTER=true` → sticky **không bắt buộc**.

## P3 prod-edge (static SPA)

1. `bash devops/scripts/build-client-static.sh`
2. Dừng nginx `dev-https.conf` nếu đang chiếm :443
3. `devops/nginx/start-prod-edge.bat` hoặc:
   ```bash
   nginx -p devops/nginx -c prod-edge.conf
   ```
4. Verify:
   ```bash
   BASE=https://voicehub.local
   curl -skf "$BASE/api/health"
   curl -skI "$BASE/" | head -5
   bash devops/nginx/verify-cf-origin-ssl.sh   # khi dùng CF origin cert
   ```

**Profile 1-node:** `API_GATEWAY_REPLICAS=1` — xem [`docs/single-node-dev-profile.md`](../../docs/single-node-dev-profile.md).

## Rollback

- Tắt Nginx; dev qua `http://localhost:5173` + proxy Vite (không mic secure context).
- Giữ `TRUST_PROXY=1` — không gây hại khi truy cập trực tiếp `:3000`.
