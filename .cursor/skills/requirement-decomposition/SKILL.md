---
name: requirement-decomposition
description: >-
  Decomposes requirements into Module, Feature, Requirement, Task hierarchies for VoiceHub microservices. Use for epics and multi-service work before plan-authoring.
---

# requirement decomposition

## When to use

Epic or multi-service feature needs task breakdown.

## When NOT to use

Tiny bugfix with known file.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`

## Input

Structured or raw requirement

## Workflow

1. Map to VoiceHub modules/services (client, gateway, services/*).
2. Break Module → Feature → Requirement → Task.
3. Tag ownership per service; mark cross-service deps.
4. Feed tasks into plan-authoring section 4.

## Expected output

Hierarchy tree + task list with owners

## Tools

Read, Grep, Glob.
