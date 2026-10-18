# Motion inventory — Wave 3 (Workspace)

Status: **Done**

Suite: `workspace`

## Six layers

| Layer | Coverage | Status |
|-------|----------|--------|
| nav | Org channel/footer items | Done |
| tab | Org member tab strip (existing) | Done |
| card | `FIGMA_WS_CARD`, `FIGMA_WS_TEAM_CARD` → `VH_MOTION_CARD` | Done |
| button | Company home hero CTAs → `VH_MOTION_BTN` / `VH_MOTION_CARD` | Done |
| form | Org picker inputs (unchanged focus tokens) | Done |
| overlay | — | N/A |

## Shared touchpoints

- `components/Organization/figmaOrganizationClasses.js` — card + row primitives
- `features/companyHome/CompanyHomeOverview.jsx` — hero actions
- `features/companyHome/DepartmentHomePage.jsx` — primary link CTA
