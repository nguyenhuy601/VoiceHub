# Cloudflare cutover — DNS & TTL reference

> **Parent:** [phase5-cloudflare-cutover-runbook.md](../../docs/phase5-cloudflare-cutover-runbook.md)

## TTL lowering (T-24h)

| Record | TTL before | TTL at T-24h | When restore |
|--------|------------|--------------|--------------|
| `staging.app` A/AAAA | Auto | **300** | After cutover stable 24h |
| `app` / `@` apex | Auto | **300** | After cutover stable 24h |
| `media.app` (grey) | 300 | **300** | Unchanged |

### CF dashboard

1. DNS → record → **Edit**.
2. TTL → **5 min** (300 seconds) hoặc **Auto** nếu CF plan chỉ hỗ trợ Auto sau lần đổi đầu.
3. Lặp cho mọi record sẽ đổi proxy tại T0.

**Mục đích:** rollback DNS/proxy propagate nhanh (&lt; 30m window).

### Verify TTL

```bash
dig +noall +answer staging.app.example.com
dig +noall +answer app.example.com
# TTL column should show 300 (or low) after T-24h
```

## Apex cutover (T0)

| Step | CF action |
|------|-----------|
| 1 | Confirm staging orange cloud PASS |
| 2 | Apex `app` / `@` A → same `<ORIGIN_IP>` |
| 3 | Enable **Proxied** (orange) on apex |
| 4 | `curl -I https://app.example.com/api/health` |

## Rollback drill (grey cloud 5 min)

| Step | Action | Timer |
|------|--------|-------|
| 1 | Note `Server: cloudflare` on apex/staging | T0 |
| 2 | Click orange → **grey** on test record | T+0 |
| 3 | Verify reachability via staging or `origin.app` | T+1m |
| 4 | Re-enable orange cloud | T+5m |
| 5 | Confirm CF path restored | T+6m |

Thực hiện thủ công trên CF dashboard (grey cloud 5 phút → orange lại). Chi tiết: [phase5-cloudflare-cutover-runbook.md](../../docs/phase5-cloudflare-cutover-runbook.md) § Rollback drill.

## Production rollback levels

| Level | Action | ETA |
|-------|--------|-----|
| 1 | Grey cloud apex | ~5 min |
| 2 | WAF log mode | ~2 min |
| 3 | Revert A record IP | TTL-bound |
| 4 | Revert NS registrar | hours — last resort |

## Liên kết

- [phase5-dns-records-checklist.md](../../docs/phase5-dns-records-checklist.md)
- [phase5-cloudflare-cutover-runbook.md](../../docs/phase5-cloudflare-cutover-runbook.md) § Rollback drill
