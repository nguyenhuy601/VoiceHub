# Cloudflare DNS — voice media (grey cloud only)

> **Parent:** [phase5-voice-udp.md](../../docs/phase5-voice-udp.md)  
> **Không** orange-cloud record media — WebRTC UDP không đi qua CF proxy.

## Record

| Field | Value |
|-------|-------|
| Name | `media` (FQDN: `media.app.example.com`) |
| Type | **A** |
| Content | `<ORIGIN_PUBLIC_IP>` (cùng IP VPS/origin chạy Docker) |
| Proxy status | **DNS only** (grey cloud) |
| TTL | 300 (hoặc Auto) |

### Staging (tuỳ chọn)

| Name | Type | Content | Proxy |
|------|------|---------|-------|
| `media.staging` | A | `<ORIGIN_PUBLIC_IP>` | **DNS only** |

Dùng cho tài liệu / STUN reference — **ICE RTP vẫn dùng IP trong `MEDIASOUP_ANNOUNCED_IP`**, không bắt buộc hostname `media.`.

## Verify grey cloud

```bash
# Không có CF proxy header khi resolve trực tiếp
dig +short media.app.example.com
# Phải trả public IP origin, không phải CF anycast
```

Orange cloud trên `media.*` → **rollback ngay** (ICE fail).

## Liên kết

- [phase5-dns-records-checklist.md](../../docs/phase5-dns-records-checklist.md)
- [phase5-voice-internet-smoke.md](../../docs/phase5-voice-internet-smoke.md)
