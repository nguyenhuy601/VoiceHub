---
name: api-testing
description: >-
  Tests VoiceHub HTTP APIs for status codes, auth, validation, and contract alignment. Use after api-design/implement changes.
---

# api testing

## When to use

API contract changed or needs verification.

## When NOT to use

UI-only without API change.

## Related Rules

- `.cursor/rules/role-api.mdc`
- `.cursor/rules/role-qa.mdc`

## Input

Endpoints + expected statuses

## Workflow

1. List cases: auth, validation, happy, forbidden.
2. Run against local stack when available; else document manual curl.
3. Never fake pass if gateway down — report blocker.

## Expected output

API test report

## Tools

Shell, Read.
