---
name: secret-scan
description: >-
  Checks VoiceHub changes for leaked secrets, tokens, and unsafe .env handling. Use before commits touching credentials or config.
---

# secret scan

## When to use

Before commit of config/auth-related changes.

## When NOT to use

Unrelated UI text.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`

## Input

Diff or paths

## Workflow

1. Search for API keys, tokens, passwords in diff.
2. Ensure secrets stay in .env and are not logged.
3. Do not print secret values in chat.

## Expected output

Secret scan report (redacted)

## Tools

Grep, Read (redact).
