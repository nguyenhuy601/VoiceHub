---
name: deployment-analysis
description: >-
  Guides VoiceHub deploy/update: Swarm for app microservices, Compose extra for ollama/minio/workers; build only the changed service; avoid full-stack rebuilds and VHDX bloat.
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

Service name; Swarm vs compose-extra

## Workflow

1. Classify: docker-stack Swarm vs docker-compose.swarm-extra.yml.
2. Propose build-local-images.sh <service> then docker service update --force.
3. Compose extra: up -d --no-build unless Dockerfile changed.
4. Never suggest build-all or compose up for app microservices.

## Expected output

Exact commands + warnings

## Tools

Shell (when executing), Read.
