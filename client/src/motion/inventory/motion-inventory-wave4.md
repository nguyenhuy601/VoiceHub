# Motion inventory — Wave 4 (Projects)

Status: **Done**

Suite: `projects`

## Six layers

| Layer | Coverage | Status |
|-------|----------|--------|
| nav | Projects sidebar (existing token use) | Done |
| tab | `ProjectHubShell` tab outlet `key={tab}` + `VH_MOTION_TAB_PANEL` | Done |
| card | Picker/landing via `FIGMA_WS_TEAM_CARD`; intake `modeCard` → `VH_MOTION_CARD` | Done |
| button | Intake `primaryBtn` / `secondaryBtn` → `VH_MOTION_BTN` | Done |
| form | Intake inputs (unchanged) | Done |
| overlay | — | N/A |

## Out of scope (N/A)

- `ProjectBoardPanel` DnD internals — not modified

## Shared touchpoints

- `features/projects/hub/ProjectHubShell.jsx`
- `features/projects/intake/intakeUi.js`
- `features/projects/landing/ProjectsLandingGrid.jsx` (via org figma team card token)
