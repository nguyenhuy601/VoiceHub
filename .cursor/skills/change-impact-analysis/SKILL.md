---
name: change-impact-analysis
description: >-
  Produces blast-radius Impact Reports (modules, APIs, DB, FE, tests, deploy)
  for change requests. Use before plan-authoring §2 Files Affected, or when
  assessing multi-service VoiceHub changes.
---

# Change impact analysis

## When to use

- Change request / feature spanning multiple modules
- Before filling plan §2.1–2.5

## When NOT to use

- Replacing full Plan Standard (use `plan-authoring`)
- Single obvious file edit

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc` (scope, MS boundaries)
- `.cursor/rules/role-solution-architect.mdc` when designing

## Input

Change description, known services, optional prior requirement analysis.

## Workflow

1. Identify candidate services under `services/`, `api-gateway/`, `client/`, `shared/`.
2. Trace routes → controllers → services → models; client API + gateway permissions.
3. Classify files: CREATE / MODIFY / DELETE / DO NOT MODIFY.
4. Map blast radius: Modules → APIs → DB → Frontend → Tests → Deployment.
5. Flag auth/RBAC/gateway touchpoints for security follow-up.
6. Hand off into `plan-authoring` §1.3/1.4, §2, §6 hints.

## Expected output

```text
Change Request
  → Affected Modules / APIs / DB / Frontend / Tests / Deployment
  → Impact Report (file lists + dependency diagram)
```

## Tools

Read, Grep, Glob. Prefer read-only.
