---
name: dependency-analysis
description: >-
  Analyzes VoiceHub package or service coupling before large upgrades or refactors.
---

# dependency analysis

## When to use

Before major dependency or cross-service coupling change.

## When NOT to use

Isolated one-file fix.

## Related Rules

- `.cursor/rules/role-solution-architect.mdc`

## Input

Package or service name

## Workflow

1. Map dependents and dependents-of.
2. Risk of upgrade/refactor.

## Expected output

Dependency graph notes + risks

## Tools

Grep, Read.
