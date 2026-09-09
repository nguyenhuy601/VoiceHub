---
name: database-design
description: >-
  Designs VoiceHub per-service schemas: entities, relationships, constraints, indexes, transactions, audit. Never shared DB across services.
---

# database design

## When to use

New collections/tables within one service.

## When NOT to use

Cross-service schema sharing.

## Related Rules

- `.cursor/rules/role-database.mdc`

## Input

Domain needs + owning service

## Workflow

1. Propose entities, relationships, constraints, indexes.
2. Transaction and audit considerations.
3. Hand off implementation to migration skill.

## Expected output

Schema proposal

## Tools

Read, Grep.
