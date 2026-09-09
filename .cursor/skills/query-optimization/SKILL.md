---
name: query-optimization
description: >-
  Optimizes VoiceHub service queries: avoid SELECT *, fix N+1, add indexes carefully within service DB ownership.
---

# query optimization

## When to use

Slow query or N+1 in one service.

## When NOT to use

Cross-DB joins (forbidden).

## Related Rules

- `.cursor/rules/role-database.mdc`

## Input

Query/path + service

## Workflow

1. Inspect query and call patterns.
2. Identify bottleneck.
3. Index/query change + validate.

## Expected output

Optimized approach + validation

## Tools

Read, Edit, Shell.
