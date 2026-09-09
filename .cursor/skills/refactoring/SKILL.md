---
name: refactoring
description: >-
  Refactors VoiceHub code without changing behavior; includes FE page-removal cleanup per remove-page-cleanup rule. Use only when user requests refactor or page removal.
---

# refactoring

## When to use

Explicit refactor or remove page/route.

## When NOT to use

Mix large refactor into unrelated feature PR.

## Related Rules

- `.cursor/rules/clean-code.mdc`
- `.cursor/rules/remove-page-cleanup.mdc`
- `.cursor/rules/voicehub-constraints.mdc`

## Input

Refactor goal / page name

## Workflow

1. Define behavior-preserving scope.
2. For page removal: App.jsx, grep client, delete orphans, npm run build.
3. Keep diffs focused; no contract changes.

## Expected output

Refactor diff + verification

## Tools

Edit, Grep, Shell build.
