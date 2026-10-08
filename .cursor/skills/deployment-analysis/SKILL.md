---
name: deployment-analysis
description: >-
  Guides VoiceHub deploy/update: Swarm for app microservices and infra AI (ollama/minio/qdrant/meili); build only the changed service; avoid full-stack rebuilds and VHDX bloat.
---

# deployment analysis

## When to use

After microservice/worker code change needing deploy.

## When NOT to use

Client-only HMR with no image change.

## Related Rules

- `.cursor/rules/swarm-compose-split.mdc`
- `.cursor/rules/docker-vhdx-disk.mdc`

## Input

Service name; Swarm (app hoặc infra AI)

## Workflow

1. Classify: luôn Swarm `docker-stack.yml` (app + ollama/minio/qdrant/meili).
2. App code: build-local-images.sh <service> rồi docker service update --force.
3. Infra public image: service update --force hoặc deploy-stack / dev-enable-profile.
4. Never suggest build-all hoặc compose up cho service trong stack.

## Expected output

Exact commands + warnings

## Tools

Shell (when executing), Read.
