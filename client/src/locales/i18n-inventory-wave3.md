# i18n inventory — Wave 3 (Projects / RA / Planning / Board / AI HITL)

**Catalog parity:** Done — `requirements`, `workspace` project keys green.

## 5-layer DoD

| Layer | Status |
|-------|--------|
| nav | Done — project hub routes |
| tab | Done — Phase1 / HITL tabs via `requirements.*` |
| card | Done |
| button | Done — AiHitl / intake CTAs via `t()` |
| form | Done — `CustomerRawFormPanel` uses `useAppStrings().t` |

## Changes this wave

- Fixed `CustomerRawFormPanel` (was `useLocale().t`)
- Added `requirements.gate2RejectReasonPlaceholder` + `phase1Status_*` aliases in gaps
- Stripped ~300+ `t()||'…'` in projects features when keys existed
- `customerRawFormSummary.js` no longer hardcodes VI fallbacks
