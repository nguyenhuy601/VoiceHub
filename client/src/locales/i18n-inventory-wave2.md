# i18n inventory — Wave 2 (Workspace / Dashboard / shell)

**Catalog parity:** Done — roots `workspace`, `dashboard`, `company`, `header`, `nav` green.

## 5-layer DoD

| Layer | Status |
|-------|--------|
| nav | Done — `nav.*` / `header.*` |
| tab | Done — company/dashboard tabs via catalog |
| card | Done — stripped redundant `t()||` fallbacks |
| button | Done |
| form | Done |

## Notes

- Suite folders: `features/companyHome`, `components/Layout`, dashboard pages.
- Residual `vi_literal` heuristic noise (comments stripped) tracked by scan; no `t_fallback` string literals remaining after strip pass.
