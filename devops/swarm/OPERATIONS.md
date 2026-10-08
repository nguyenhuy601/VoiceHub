# VoiceHub — Script vận hành (deploy / build / scale)

> Script one-shot Phase 1 / migration Rabbit / prune-GC / scale helper đã gỡ.  
> Smoke: checklist trong `docs/` và mục [Smoke thủ công](#smoke-thủ-công).

## Build & deploy

| Script | Mục đích |
|--------|----------|
| [`build-local-images.sh`](./build-local-images.sh) | Build `voicehub-*:latest` local (context repo root) |
| [`resolve-swarm-images.sh`](./resolve-swarm-images.sh) | Resolve image tags trước deploy |
| [`deploy-stack.sh`](./deploy-stack.sh) | Deploy stack Swarm chính (app + ollama/minio/qdrant/meili) |
| [`deploy-release.sh`](./deploy-release.sh) | Deploy theo release manifest (CD) |
| [`dev-enable-profile.sh`](./dev-enable-profile.sh) | Label node + deploy + pull model Ollama |

## Scale & placement

| Script | Mục đích |
|--------|----------|
| [`node-labels.sh`](./node-labels.sh) | Gán label node (`ai=true`, `voice=true`, …) |

Scale replica: `docker service scale voicehub_<service>=N`

## Stateful stacks

| Script | Mục đích |
|--------|----------|
| [`redis-sentinel/deploy-sentinel-stack.sh`](./redis-sentinel/deploy-sentinel-stack.sh) | Deploy Redis Sentinel |
| [`rabbitmq-cluster/deploy-cluster-stack.sh`](./rabbitmq-cluster/deploy-cluster-stack.sh) | Deploy RabbitMQ cluster |

## Scripts hỗ trợ (`devops/scripts/`)

| Script | Mục đích |
|--------|----------|
| [`check-security-env.sh`](../scripts/security/check-security-env.sh) | Audit biến môi trường (CI/CD) |
| [`resolve-docker-matrix.sh`](../scripts/docker/resolve-docker-matrix.sh) | Resolve matrix image CI |
| [`generate-release-manifest.mjs`](../scripts/release/generate-release-manifest.mjs) | Release manifest sau publish |

## Nginx

| Script | Mục đích |
|--------|----------|
| [`verify-cf-origin-ssl.sh`](../nginx/verify-cf-origin-ssl.sh) | Verify TLS origin (Full strict) |
| [`mkcert-setup.ps1`](../nginx/mkcert-setup.ps1) | Cert dev LAN |
| [`print-lan-hosts-hint.ps1`](../nginx/print-lan-hosts-hint.ps1) | Gợi ý hosts file |

## Quick start deploy

```bash
VOICEHUB_ENV_CHECK=staging bash devops/scripts/security/check-security-env.sh
bash devops/swarm/build-local-images.sh
bash devops/swarm/node-labels.sh
bash devops/swarm/deploy-stack.sh
docker stack services voicehub
```

## Smoke thủ công

```bash
curl -sf http://127.0.0.1:3000/health
curl -sf http://127.0.0.1:3005/health

BASE=https://voicehub.local
curl -skf "$BASE/api/health"
curl -skf "$BASE/socket.io/?EIO=4&transport=polling"

bash devops/nginx/verify-cf-origin-ssl.sh
```

### Checklist theo giai đoạn

| Giai đoạn | Doc |
|-----------|-----|
| Dev LAN HTTPS | [lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md) |
| Voice staging | [voice-staging-smoke.md](./voice-staging-smoke.md) |
| Socket / DM | [realtime-ha-checklist.md](./realtime-ha-checklist.md) |
| Production cutover | [production-cutover-voicehub-guide.md](../../.cursor/plans/docs/production-cutover-voicehub-guide.md) |
