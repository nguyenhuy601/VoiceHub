# Cloudflare WebSocket — dashboard reference

> Operator spec — không commit secrets.

## WebSockets enabled

| Step | CF dashboard |
|------|----------------|
| 1 | Zone → **Network** |
| 2 | **WebSockets** = **ON** (default on proxied zones) |

## Proxied record

- DNS A/AAAA record → **orange cloud** (proxied).
- Client connects `wss://<hostname>/socket.io/...`.

## Idle timeout (plan-dependent)

| Plan | Typical idle WS timeout |
|------|-------------------------|
| Free / Pro | ~100s (varies) |
| Business+ | Longer; check CF docs |

**Mitigation:** Socket.IO ping/reconnect in client (`SocketContext.jsx`). Nginx origin `proxy_read_timeout 3600s` — không phải bottleneck CF idle.

## WAF

Nếu polling/upgrade bị 403 → custom skip rules — xem [phase5-waf-false-positives.md](../../docs/phase5-waf-false-positives.md).

## Verify

```bash
BASE=https://staging.app.example.com
curl -skf "$BASE/socket.io/?EIO=4&transport=polling"
```

## Liên kết

- [phase5-cloudflare-websocket.md](../../docs/phase5-cloudflare-websocket.md)
- [prod-edge.cf.example.conf](../nginx/cloudflare/prod-edge.cf.example.conf)
