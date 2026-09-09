---
name: environment-analysis
description: >-
  Analyzes VoiceHub env and LAN HTTPS setup: .env only, VITE_API_URL=/api, voicehub.local, socket via gateway, HMR wss. Use for CORS, wrong API host, LAN access issues.
---

# environment analysis

## When to use

Dev LAN, CORS, socket URL, Vite env misconfig.

## When NOT to use

Pure business-logic bugs.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`

## Input

Symptom or env question

## Workflow

1. Check .env / client .env for VITE_* and gateway URLs (do not print secrets).
2. Enforce same-origin /api and voicehub.local guidance from constraints.
3. Do not hardcode LAN IPs in code or invite links.
4. Suggest verify-lan-https.ps1 when appropriate.

## Expected output

Env findings + required variable corrections

## Tools

Read (never echo secrets).
