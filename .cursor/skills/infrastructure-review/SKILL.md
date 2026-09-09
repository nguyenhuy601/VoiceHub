---
name: infrastructure-review
description: >-
  Reviews VoiceHub infra files (docker-stack, nginx, compose extra) for correctness vs Swarm/Compose split and LAN HTTPS. Use when changing infra configs.
---

# infrastructure review

## When to use

Infra/nginx/stack YAML changes.

## When NOT to use

Application-only PRs.

## Related Rules

- `.cursor/rules/swarm-compose-split.mdc`
- `.cursor/rules/voicehub-constraints.mdc`

## Input

Infra diff

## Workflow

1. Validate Swarm vs Compose responsibilities.
2. Check LAN HTTPS assumptions.
3. Findings + risks.

## Expected output

Infra review report

## Tools

Read, Grep.
