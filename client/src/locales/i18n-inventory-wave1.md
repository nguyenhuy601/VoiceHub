# i18n inventory — Wave 1 (Admin)

**Catalog parity:** Done — `adminDomains` / `adminRbac` / `adminTasks` leaf VI↔EN green.

## Scan (`--suite=admin`)

| Kind | Pass criteria | Status |
|------|---------------|--------|
| `t_fallback` (string literal) | 0 | Done |
| `useLocale_t` | 0 | Done |
| `vi_literal` residual | allowlist regex strip helpers only | Done (N/A residual ≤2) |

## 5-layer DoD

| Layer | Status |
|-------|--------|
| nav | Done — `adminDomainsConfig` labelKeys |
| tab | Done — section labelKeys |
| card | Done — catalog + gaps; taxonomy hub via `t()` |
| button | Done — RBAC panels stripped hardcode fallbacks |
| form | Done — keys via `adminDomains.*` / `adminUsers.*` / gaps |

## Changes this wave

- Added 22+5+2 missing EN keys in `adminDomains.strings.js`
- Fixed VI mixed “Org Role” in taxonomy card
- `userTaxonomyUtils` → `createTranslator(readStoredLocale())`
- Stripped `t()||'…'` when keys exist
