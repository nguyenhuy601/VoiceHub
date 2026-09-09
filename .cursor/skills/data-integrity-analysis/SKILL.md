---
name: data-integrity-analysis
description: >-
  Analyzes data integrity within a VoiceHub service: invariants, orphans, consistency. Use when data corruption suspected.
---

# data integrity analysis

## When to use

Suspected inconsistent or orphan data.

## When NOT to use

Normal CRUD feature work.

## Related Rules

- `.cursor/rules/role-database.mdc`

## Input

Symptom + owning service

## Workflow

1. Define invariants.
2. Search for violations in code/data access patterns.
3. Recommend fixes without cross-service DB access.

## Expected output

Integrity findings + remediation

## Tools

Read, Grep.
