# Cloudflare WAF — dashboard reference (operator)

> Không commit secrets. Cấu hình thực tế trên CF dashboard — file này là **spec** để replicate.

## OWASP Core Ruleset

| Step | CF dashboard |
|------|----------------|
| 1 | Security → **WAF** → Managed rules |
| 2 | Deploy **Cloudflare OWASP Core Ruleset** |
| 3 | Staging: Action **Log** (24h) |
| 4 | Production: Action **Block** sau tune |

## Rate limiting — login

| Field | Value |
|-------|-------|
| Rule name | `voicehub-login-rate-limit` |
| If incoming requests match | Custom filter expression |
| Expression | `(http.request.uri.path contains "/api/auth/login")` |
| With the same characteristics | IP |
| Requests | **5** |
| Period | **1 minute** (5 per 1 minute per IP) |
| Action | Block *hoặc* Managed Challenge (staging: Block để test 429) |

## Bot Fight Mode

| Environment | Khuyến nghị |
|-------------|-------------|
| Staging | **Off** hoặc sensitivity thấp — tránh challenge API |
| Production | Review sau WAF stable |

## Layer alignment (VoiceHub)

| Layer | Login limit | File |
|-------|-------------|------|
| Cloudflare | 5/min/IP | Dashboard |
| Nginx | `5r/m` zone `api_login` | `devops/nginx/prod-edge.conf` |
| Gateway | App middleware | không đổi contract |

Khi CF active: có thể nới nginx `burst` nếu double-429 — xem [phase5-waf-false-positives.md](../../docs/phase5-waf-false-positives.md).

## Liên kết

- [phase5-waf-rules.md](../../docs/phase5-waf-rules.md)
- [phase5-waf-false-positives.md](../../docs/phase5-waf-false-positives.md)
