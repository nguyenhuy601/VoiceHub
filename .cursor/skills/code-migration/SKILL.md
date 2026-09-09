---
name: code-migration
description: >-
  Migrates VoiceHub code between patterns or modules within scope (API client patterns, folder moves). Use for deliberate migrations with regression plan.
---

# code migration

## When to use

Named migration of patterns/modules.

## When NOT to use

Open-ended cleanup.

## Related Rules

- `.cursor/rules/senior-dev-engineering.mdc`
- `.cursor/rules/clean-code.mdc`

## Input

From→to pattern + scope

## Workflow

1. Inventory call sites.
2. Migrate incrementally with tests.
3. Update imports; remove dead paths.

## Expected output

Migration diff + test notes

## Tools

Edit, Grep, Shell.
