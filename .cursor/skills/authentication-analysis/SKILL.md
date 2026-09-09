---
name: authentication-analysis
description: >-
  Analyzes VoiceHub authentication: JWT, gateway internal token, trust of x-user-id, bootstrap/internal routes. Use when touching auth-service or gateway auth forwarding.
---

# authentication analysis

## When to use

Auth flow or gateway trust changes.

## When NOT to use

Authorization-only RBAC catalog edits (use authorization-analysis).

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`

## Input

Auth-related change

## Workflow

1. Verify gateway JWT verify + internal token forward.
2. Ensure services do not trust x-user-id without gateway trust.
3. Check /internal routes use internalGatewayAuth only.

## Expected output

AuthN findings

## Tools

Read, Grep.
