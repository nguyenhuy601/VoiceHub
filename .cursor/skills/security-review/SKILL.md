---
name: security-review
description: >-
  Security gate review for VoiceHub diffs: authn/authz, secrets, injection, token handling, sensitive logs. Use after auth/gateway/RBAC changes or when user requests security review.
---

# security review

## When to use

Post-change security gate; authn/authz/gateway diffs.

## When NOT to use

Casual feature polish without security surface.

## Related Rules

- `.cursor/rules/role-rbac.mdc`
- `.cursor/rules/voicehub-constraints.mdc`
- `.cursor/rules/role-code-reviewer.mdc`

## Input

Diff or file list

## Workflow

1. Scan for token exposure, bypass, secret leakage, injection, unsafe logging.
2. Require check-security-env.sh + security-regression-smoke.md when fixing security.
3. Report Critical/High/Medium with remediation.

## Expected output

Security findings by severity

## Tools

Read, Grep, Shell (security scripts). Prefer readonly for product code.
