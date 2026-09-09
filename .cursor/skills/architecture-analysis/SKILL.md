---
name: architecture-analysis
description: >-
  Analyzes VoiceHub system components, service boundaries, dependencies, data flows, integration, scalability, and risks. Use for multi-service design or before large changes. Read-only by default.
---

# architecture analysis

## When to use

Need as-is or to-be architecture understanding across services.

## When NOT to use

Single-file bug with known cause.

## Related Rules

- `.cursor/rules/role-solution-architect.mdc`
- `.cursor/rules/voicehub-constraints.mdc`

## Input

Goal + optional area (chat, auth, projects)

## Workflow

1. Inventory relevant services and client surfaces.
2. Document components, boundaries, dependencies, data flow.
3. Note integration (HTTP S2S, events, sockets) and scalability risks.
4. Do not write product code unless user explicitly asks.

## Expected output

Components, boundaries, deps, data flow, integration, scalability, risks

## Tools

Read, Grep, Glob, CreatePlan. Prefer readonly.
