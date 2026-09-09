---
name: dependency-upgrade
description: >-
  Upgrades npm/package dependencies for VoiceHub with regression awareness. Use when user requests dependency bumps.
---

# dependency upgrade

## When to use

Explicit dependency upgrade request.

## When NOT to use

Casual add of packages during unrelated features (avoid unless required).

## Related Rules

- `.cursor/rules/senior-dev-engineering.mdc`

## Input

Package name/version target

## Workflow

1. Check current version and lockfile scope (root/client/service).
2. Upgrade minimally; run relevant tests/build.
3. Document breaking changes.

## Expected output

Upgrade diff + verification

## Tools

Shell, Edit.
