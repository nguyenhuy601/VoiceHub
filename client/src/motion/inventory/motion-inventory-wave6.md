# Motion inventory — Wave 6 (Auth / Me)

Status: **Done**

Suite: `auth`

## Six layers

| Layer | Coverage | Status |
|-------|----------|--------|
| nav | Settings sidebar nav row → `VH_MOTION_ROW` | Done |
| tab | — | N/A |
| card | Settings cards → `VH_MOTION_CARD` | Done |
| button | Auth `FIGMA_BTN`; calendar create → `VH_MOTION_BTN` | Done |
| form | Existing input focus tokens | Done |
| overlay | Modal SoT (Wave 1 shared) | Done |

## Shared touchpoints

- `components/Auth/figmaAuthClasses.js` — `FIGMA_BTN`
- `components/Calendar/figmaCalendarClasses.js` — `FIGMA_CAL_CREATE_BTN`
- `components/Settings/figmaSettingsClasses.js` — nav, card, matrix row

## Exceptions (N/A)

- Login ambient / marketing glow — out of scope SoT
