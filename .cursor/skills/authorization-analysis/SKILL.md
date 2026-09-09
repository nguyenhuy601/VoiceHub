---
name: authorization-analysis
description: >-
  Analyzes VoiceHub RBAC/authorization: roles, permissions, scopes, IDOR, FE-vs-BE enforcement, gateway trust and x-user-id. Use when touching permissions.js, role-permission-service, or authz-sensitive APIs.
---

# authorization analysis

## When to use

Permission/RBAC/JWT scope/authorization changes or reviews.

## When NOT to use

Pure styling without access control.

## Related Rules

- `.cursor/rules/role-rbac.mdc`
- `.cursor/rules/voicehub-constraints.mdc`

## Input

Change or area under review

## Workflow

1. Map User to Role to Permission to Resource to Action to Scope.
2. Check privilege escalation, IDOR, tenant/project isolation.
3. Verify BE enforces (not FE-only); trusted gateway internal token before x-user-id.
4. Output findings by severity; say if insufficient info.

## Expected output

AuthZ findings + severity + recommendations

## Tools

Read, Grep. Prefer readonly.
