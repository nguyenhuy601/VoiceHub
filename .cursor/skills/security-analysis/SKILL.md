---
name: security-analysis
description: >-
  Broad VoiceHub security analysis covering authn/authz, validation, injection, uploads, secrets, tokens, sessions, RBAC, data exposure. Use for audits or sensitive features.
---

# security analysis

## When to use

Security audit or sensitive feature design.

## When NOT to use

Non-sensitive copy tweaks.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`
- `.cursor/rules/role-rbac.mdc`

## Input

Area or feature

## Workflow

1. Walk checklist: authn, authz, validation, injection, upload, secrets, token, session, RBAC, exposure.
2. Findings by severity.

## Expected output

Security findings

## Tools

Read, Grep. Prefer readonly.
