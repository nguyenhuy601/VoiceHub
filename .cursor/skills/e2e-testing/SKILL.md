---
name: e2e-testing
description: >-
  Guides VoiceHub end-to-end checks on https://voicehub.local for critical UX flows. Use for large FE regressions.
---

# e2e testing

## When to use

Critical UX flow verification on LAN HTTPS.

## When NOT to use

Unit-only logic changes.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`
- `.cursor/rules/role-frontend.mdc`

## Input

User journeys

## Workflow

1. Define journeys and expected UI outcomes.
2. Verify via browser or documented manual steps on voicehub.local.
3. Record pass/fail/blockers.

## Expected output

E2E results

## Tools

Read, optional browser tools.
