---
name: requirement-traceability
description: >-
  Builds Req to AC to API to Test traceability matrices for VoiceHub releases or audits. Use for large releases needing coverage proof.
---

# requirement traceability

## When to use

Release audit or coverage mapping requested.

## When NOT to use

Small single-task fixes.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`
- `.cursor/rules/deep-agents-dispatch.mdc` (agent: `reviewer`)

## Input

IDs for req/AC/API/tests

## Workflow

1. Collect identifiers from plans and code.
2. Build matrix Req→AC→API→Test.
3. Highlight uncovered requirements.

## Expected output

Traceability matrix + gaps

## Tools

Read, Grep.
