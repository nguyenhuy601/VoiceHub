---
name: migration
description: >-
  Plans and applies safe, reversible database/model migrations within a single VoiceHub service ownership boundary. Use when changing schemas, indexes, or data backfills.
---

# migration

## When to use

Model/schema/index/migration or data backfill in one service.

## When NOT to use

Cross-service shared schema (forbidden).

## Related Rules

- `.cursor/rules/role-database.mdc`
- `.cursor/rules/voicehub-constraints.mdc`

## Input

Desired schema change + owning service

## Workflow

1. Confirm single-service DB ownership.
2. Impact analysis: tables, indexes, readers/writers.
3. Design UP + DOWN (reversible) when possible.
4. Avoid destructive changes without rollback plan.
5. Implement migration/model updates only in owning service.
6. Validate with service tests + rollback notes in plan section 6.4.

## Expected output

Migration plan/diff + rollback

## Tools

Read, Edit, Shell tests.
