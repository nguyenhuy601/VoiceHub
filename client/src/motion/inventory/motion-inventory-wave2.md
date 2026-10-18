# Motion inventory — Wave 2 (Admin)

Status: **Done**

Suite: `admin` — `motion-scan-adhoc.mjs --suite=admin`

## Six layers

| Layer | Coverage | Status |
|-------|----------|--------|
| nav | AdminNavigationSidebar (existing tokens); hub domain cards | Done |
| tab | `AdminHubTablist` / hub shells → `VH_MOTION_TAB_PANEL`; entity ops tabs → `VH_MOTION_BTN` | Done |
| card | `AdminHubPage` domain tiles → `VH_MOTION_CARD` | Done |
| button | `adminUserPanelUi` (`adminPrimaryBtnClass`, `adminCompactBtnClass`, …); bulk row-hover → `vh-motion-row` | Done |
| form | `adminInputClass` / `adminFilterSelectClass` use `--vh-motion-base` | Done |
| overlay | Wave 1 drawer; no `admin-drawer-in` / `ADMIN_DRAWER_KEYFRAMES` in admin tree | Done |

## Shared touchpoints

- `components/adminUsers/adminUserPanelUi.jsx` — extended helpers (`adminHoverRowClass`, `adminFilterSelectClass`, `adminListIconBtnClass`, `adminCompactBtnClass`)
- `pages/Admin/AdminHubPage.jsx` — `VH_MOTION_CARD`
- `components/Admin/AdminEntityOpsHubShell.jsx` — tab buttons `VH_MOTION_BTN`
- `features/adminAccounts/accountPanelParts.jsx` — icon btn `VH_MOTION_BTN`
- Admin feature panels — ad-hoc `duration-150` row hovers → `vh-motion-row vh-motion-respect`

## Exceptions (N/A)

- `@dnd-kit` / board panels — unchanged
- Chevron `transition-transform duration-150` (accordion affordance) — kept local
