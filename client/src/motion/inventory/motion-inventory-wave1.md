# Motion inventory — Wave 1 (Foundation)

Status: **Done**

## Delivered

| Item | Location | Primitive |
|------|----------|-----------|
| GlassCard hover | `components/Shared/GlassCard.jsx` | `VH_MOTION_CARD` |
| Admin route outlet | `components/Layout/AdminShellLayout.jsx` | `PageMotion` |
| Company admin outlet | `pages/Admin/CompanyAdminLayout.jsx` | `PageMotion` |
| Admin user drawer | `components/adminUsers/AdminUserDetailDrawer.jsx` | `useMotionPresence` + `VH_PRESENCE_DRAWER_RIGHT` + `VH_MOTION_TAB_PANEL` |
| Admin panel buttons/rows | `components/adminUsers/adminUserPanelUi.jsx` | `VH_MOTION_BTN` / `VH_MOTION_ROW` |
| framer-motion removed | `client/package.json` | — |
| Presence unit tests | `src/motion/presenceState.test.js` | — |

## Wave 0 gap table (updated)

See `motion-inventory-wave0.md` §2 — baseline gaps marked **Done (Wave 1)** except domain N/A (board DnD, waveform, ambient stars).

## Layers (admin shell — partial; completed in Wave 2)

| Layer | Status |
|-------|--------|
| nav | Open → Wave 2 |
| tab | Partial (`AdminHubTablist` TAB_PANEL) |
| card | Partial (GlassCard) |
| button | Done (adminUserPanelUi base) |
| form | Partial (adminInputClass tokens Wave 2) |
| overlay | Done (drawer + ConfirmDialog pattern) |
