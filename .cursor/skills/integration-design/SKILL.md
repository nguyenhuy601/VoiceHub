---
name: integration-design
description: >-
  Designs VoiceHub S2S, events, gateway, and socket integrations without putting business HTTP clients in shared/. Use when adding cross-service integration.
---

# integration design

## When to use

New event, S2S client, gateway BFF, or socket contract.

## When NOT to use

In-process single-service logic.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`
- `.cursor/rules/role-solution-architect.mdc`

## Input

Integration goal

## Workflow

1. Choose HTTP client under services/<name>/src/clients or messaging schema in shared/messaging.
2. Define payloads, idempotency, failure modes.
3. Gateway trust and internal token requirements.

## Expected output

Integration design + ownership

## Tools

Read, Grep.
