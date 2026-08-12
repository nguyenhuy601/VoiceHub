# VoiceHub — Script vận hành (deploy / build / scale)

> **Lưu ý:** Các script verify/smoke theo phase (`run-p*.sh`, `run-g*.sh`, `run-s3-validation.sh`, …) đã **gỡ** sau khi hoàn thành Phase 0–5.  
> Kiểm tra lại hành vi: dùng **checklist** trong `docs/` và mục [Smoke thủ công](#smoke-thủ-công) bên dưới.

## Build & deploy

| Script | Mục đích |
|--------|----------|
| [`build-local-images.sh`](./build-local-images.sh) | Build `voicehub-*:latest` local (context repo root) |
| [`build-and-push.sh`](./build-and-push.sh) | Build + push registry |
| [`resolve-swarm-images.sh`](./resolve-swarm-images.sh) | Resolve image tags trước deploy |
| [`deploy-stack.sh`](./deploy-stack.sh) | Deploy stack Swarm chính |
| [`deploy-phase1-cutover.sh`](./deploy-phase1-cutover.sh) | Cutover P1 (Atlas / stateful) |
| [`rolling-update-phase1-env.sh`](./rolling-update-phase1-env.sh) | Rolling update env Phase 1 |
| [`phase1-pre-cutover-snapshot.sh`](./phase1-pre-cutover-snapshot.sh) | Snapshot trước cutover P1 |
| [`prune-swarm-dev.sh`](./prune-swarm-dev.sh) | Dọn image/volume dev |

## Scale & placement

| Script | Mục đích |
|--------|----------|
| [`node-labels.sh`](./node-labels.sh) | Gán label node (`voice=true`, …) |
| [`scale-workers.sh`](./scale-workers.sh) | Scale worker theo queue |
| [`scale-runbook.sh`](./scale-runbook.sh) | Template lệnh scale |

## Stateful stacks

| Script | Mục đích |
|--------|----------|
| [`redis-sentinel/deploy-sentinel-stack.sh`](./redis-sentinel/deploy-sentinel-stack.sh) | Deploy Redis Sentinel |
| [`rabbitmq-cluster/deploy-cluster-stack.sh`](./rabbitmq-cluster/deploy-cluster-stack.sh) | Deploy RabbitMQ cluster |
| [`rabbitmq-cluster/purge-classic-queues.sh`](./rabbitmq-cluster/purge-classic-queues.sh) | Purge classic queues (migration) |

## Observability

| Script | Mục đích |
|--------|----------|
| [`observability/deploy-observability-stack.sh`](./observability/deploy-observability-stack.sh) | Deploy Prometheus/Grafana stack |
| [`observability/export-swarm-metrics.sh`](./observability/export-swarm-metrics.sh) | Export metrics Swarm |

## Scripts hỗ trợ (`devops/scripts/`)

| Script | Mục đích |
|--------|----------|
| [`build-client-static.sh`](../scripts/build-client-static.sh) | Build SPA `client/dist` |
| [`check-security-env.sh`](../scripts/check-security-env.sh) | Audit biến môi trường |
| [`rotate-staging-secrets.sh`](../scripts/rotate-staging-secrets.sh) | Rotate secret staging |
| [`cloudflare-fetch-ips.sh`](../scripts/cloudflare-fetch-ips.sh) | Tải danh sách IP Cloudflare |
| [`cloudflare-origin-lockdown.sh`](../scripts/cloudflare-origin-lockdown.sh) | Firewall origin chỉ CF |
| [`install-cf-origin-cert.sh`](../scripts/install-cf-origin-cert.sh) | Cài origin cert CF |
| [`voice-udp-firewall-linux.sh`](../scripts/voice-udp-firewall-linux.sh) | Mở UDP voice (Linux) |
| [`voice-udp-firewall-windows.ps1`](../scripts/voice-udp-firewall-windows.ps1) | Mở UDP voice (Windows) |
| [`rabbit-queue-depth.sh`](../scripts/rabbit-queue-depth.sh) | Kiểm tra độ sâu queue |
| [`phase1-mongodump.sh`](../scripts/phase1-mongodump.sh) | Backup Mongo local |
| [`phase1-mongorestore-atlas.sh`](../scripts/phase1-mongorestore-atlas.sh) | Restore lên Atlas |
| [`phase1-volume-snapshot.sh`](../scripts/phase1-volume-snapshot.sh) | Snapshot volume P1 |

## Nginx

| Script | Mục đích |
|--------|----------|
| [`verify-cf-origin-ssl.sh`](../nginx/verify-cf-origin-ssl.sh) | Verify TLS origin (Full strict) |
| [`mkcert-setup.ps1`](../nginx/mkcert-setup.ps1) | Cert dev LAN |
| [`print-lan-hosts-hint.ps1`](../nginx/print-lan-hosts-hint.ps1) | Gợi ý hosts file |

## Quick start deploy

```bash
bash devops/scripts/rotate-staging-secrets.sh --apply
VOICEHUB_ENV_CHECK=staging bash devops/scripts/check-security-env.sh
bash devops/swarm/build-local-images.sh
bash devops/swarm/node-labels.sh
bash devops/swarm/deploy-stack.sh
docker stack services voicehub
```

## Smoke thủ công

Thay các script phase đã gỡ. Đặt `BASE` = hostname CF hoặc `https://voicehub.local` (dev).

```bash
# Health gateway (origin)
curl -sf http://127.0.0.1:3000/health
curl -sf http://127.0.0.1:3005/health

# Edge HTTPS
BASE=https://voicehub.local   # hoặc https://staging.app.example.com
curl -skf "$BASE/api/health"
curl -skf "$BASE/socket.io/?EIO=4&transport=polling"
curl -sk -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{}'

# CF origin cert (sau cài cert)
bash devops/nginx/verify-cf-origin-ssl.sh

# Origin lockdown — qua CF OK, direct IP fail
curl -sS -o /dev/null -w '%{http_code}\n' https://staging.app.example.com/api/health
curl -sk --max-time 5 -o /dev/null -w '%{http_code}\n' https://<VPS_PUBLIC_IP>/api/health
```

### Checklist theo giai đoạn

| Giai đoạn | Doc |
|-----------|-----|
| Dev LAN HTTPS | [lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md) |
| Voice staging | [voice-staging-smoke.md](./voice-staging-smoke.md) |
| Socket / DM | [realtime-ha-checklist.md](./realtime-ha-checklist.md) |
| P5 E2E internet | [phase5-e2e-internet-checklist.md](../../docs/phase5-e2e-internet-checklist.md) |
| Production cutover | [production-cutover-voicehub-guide.md](../../.cursor/plans/docs/production-cutover-voicehub-guide.md) |

## Runbook liên quan

- [ha-infra-roadmap.md](./ha-infra-roadmap.md)
- [staging-nginx-edge.md](./staging-nginx-edge.md)
- [phase2-workers-autoscale-runbook.md](./phase2-workers-autoscale-runbook.md)
- [p1-atlas-migration-runbook.md](./p1-atlas-migration-runbook.md)
- [observability-baseline.md](./observability-baseline.md)
