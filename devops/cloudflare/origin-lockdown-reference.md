# Cloudflare origin lockdown — operator reference

> **Parent:** [phase5-origin-lockdown.md](../../docs/phase5-origin-lockdown.md)  
> **IP list:** `bash devops/scripts/cloudflare-fetch-ips.sh`

## Rule matrix

| Port | Protocol | Source | Action | Note |
|------|----------|--------|--------|------|
| 443 | TCP | [CF IPv4/v6 ranges](https://www.cloudflare.com/ips/) | **ALLOW** | App/API/WS qua orange cloud |
| 40000–40010 | UDP | `0.0.0.0/0` | **ALLOW** | Voice media — [phase5-voice-udp.md](../../docs/phase5-voice-udp.md) |
| 40011–40100 | UDP | — | **DENY** default | mediasoup internal range; chỉ publish 40000–40010 trên Swarm |
| 22 | TCP | Admin CIDR only | **ALLOW** | Không `0.0.0.0/0` |
| 443 | TCP | Other | **DENY** | Direct origin IP HTTPS blocked |

## Linux (ufw)

```bash
bash devops/scripts/cloudflare-fetch-ips.sh
bash devops/scripts/cloudflare-origin-lockdown.sh --dry-run
ADMIN_SSH_CIDRS="203.0.113.10/32" sudo bash devops/scripts/cloudflare-origin-lockdown.sh
```

## AWS Security Group (example)

| Type | Port | Source | Description |
|------|------|--------|-------------|
| HTTPS | 443 | `173.245.48.0/20` … *(all CF v4 from ips-v4.txt)* | CF only |
| Custom UDP | 40000-40010 | `0.0.0.0/0` | Voice WebRTC |
| SSH | 22 | `<ADMIN_IP>/32` | Break-glass |

Refresh SG khi `cloudflare-fetch-ips.sh` cập nhật — **monthly cron**.

## Windows / Docker Desktop

**WAIVE** full CF allowlist — mitigation:

- Không port-forward `:3000` ra internet
- Chỉ expose nginx `:443` nếu cần; ưu tiên CF orange cloud
- Ghi WAIVE trong gate P5

## Verify

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://staging.app.example.com/api/health
curl -sk --max-time 5 -o /dev/null -w '%{http_code}\n' https://<VPS_PUBLIC_IP>/api/health
```

## Liên kết

- [cloudflare-origin-lockdown.sh](../scripts/cloudflare-origin-lockdown.sh)
- [phase5-cloudflare-cutover-runbook.md](../../docs/phase5-cloudflare-cutover-runbook.md)
