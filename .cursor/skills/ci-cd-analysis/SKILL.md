---
name: ci-cd-analysis
description: >-
  Analyzes VoiceHub CI/CD or image publish flows (ghcr, pipelines) when builds fail or deploy process changes.
---

# ci cd analysis

## When to use

CI failure or pipeline change.

## When NOT to use

Local-only code edit with no CI impact.

## Related Rules

- `.cursor/rules/docker-vhdx-disk.mdc`

## Input

CI logs or pipeline files

## Workflow

1. Locate failing job.
2. Root cause vs flaky.
3. Recommend fix without unnecessary full rebuilds.

## Expected output

CI analysis + fix

## Tools

Read, Shell, gh if needed.
