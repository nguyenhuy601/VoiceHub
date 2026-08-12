# Cloudflare Origin TLS — nginx

> Cài cert **Origin CA** từ Cloudflare Dashboard (không commit PEM vào git).

## Paths (relative to `devops/nginx/`)

| File | Mục đích |
|------|----------|
| `certs/cf-origin.pem` | Origin certificate (CF issued) |
| `certs/cf-origin-key.pem` | Private key (**gitignore**) |

Thêm vào `.gitignore` (đã có trong repo):

```
devops/nginx/certs/cf-origin-key.pem
devops/nginx/certs/cf-origin.pem
```

**Install:**

```bash
bash devops/scripts/install-cf-origin-cert.sh --check
bash devops/scripts/install-cf-origin-cert.sh /path/to/cert.pem /path/to/key.pem
bash devops/nginx/verify-cf-origin-ssl.sh
```

## Tạo Origin CA cert (CF dashboard)

1. SSL/TLS → **Origin Server** → Create Certificate.
2. Hostnames: `app.example.com`, `*.app.example.com` (hoặc staging + apex).
3. Validity: 15 years.
4. Save PEM + key vào paths trên.

## Nginx

Dùng [prod-edge.cf.example.conf](./prod-edge.cf.example.conf) làm mẫu `server_name` + `ssl_certificate` cho production.

Staging LAN vẫn dùng [prod-edge.conf](../prod-edge.conf) + mkcert `voicehub.local`.

## SSL mode (CF dashboard)

| Setting | Value |
|---------|-------|
| SSL/TLS encryption mode | **Full (strict)** |
| Always Use HTTPS | On |
| Minimum TLS Version | 1.2 |

Origin phải present cert khớp hostname CF gửi tới origin (`Host` header).

## Verify origin HTTPS (grey cloud)

Trước khi bật orange cloud:

```bash
curl -skI --resolve staging.app.example.com:443:ORIGIN_IP https://staging.app.example.com/api/health
```

## Liên kết

- [phase5-dns-tls.md](../../docs/phase5-dns-tls.md)
- [phase5-cloudflare-prep.md](../../docs/phase5-cloudflare-prep.md)
