---
name: s4-api-pagination-client
overview: "S4b — Thống nhất API client: pageToken/before, taskAPI workspace mode, auto refresh token."
todos:
  - id: pagination-client
    content: Client messages/notifications dùng pageToken/before — bỏ gửi page legacy
    status: completed
  - id: task-api-workspace
    content: taskAPI.js chốt mode workspace thay dual khi staging ổn
    status: completed
  - id: auth-auto-refresh
    content: Implement auto refresh trong client authService interceptor
    status: completed
  - id: legacy-redirect-sunset
    content: Document sunset date cho LegacyWorkspaceRedirect
    status: completed
isProject: false
---

# S4b — API Contract & Client Consistency

**Phụ thuộc:** [s4-gateway-legacy.plan.md](s4-gateway-legacy.plan.md)  
**Tiếp theo:** [s4-docs-alignment.plan.md](s4-docs-alignment.plan.md)  
**Tiêu chí:** Thống nhất

## 1. Mục tiêu & phạm vi

### Done
- Client không gửi `page` query mới (chỉ pageToken/before)
- Task board dùng workspace API làm default
- Token hết hạn → refresh tự động, giảm 401 giả
- Legacy URL redirect có ngày sunset ghi trong code comment hoặc docs

### In-scope
- [`client/src/lib/parseMessageListPage.js`](../../../client/src/lib/parseMessageListPage.js)
- [`client/src/services/api/taskAPI.js`](../../../client/src/services/api/taskAPI.js)
- [`client/src/services/authService.js`](../../../client/src/services/authService.js)
- [`client/src/components/Layout/LegacyWorkspaceRedirect.jsx`](../../../client/src/components/Layout/LegacyWorkspaceRedirect.jsx)

### Out-of-scope
- Backend xóa hỗ trợ `page` (giữ log deprecation server-side)
- Chi tiết implementation: tham chiếu [wave-2e-cursor-pagination-dto.plan.md](../../wave-2e-cursor-pagination-dto.plan.md)

## 2. Files affected

| Sửa | Tham chiếu |
|-----|------------|
| `parseMessageListPage.js`, notification pages | wave-2e contract |
| `taskAPI.js` | bỏ `dual` default |
| `authService.js` | interceptor refresh |
| `LegacyWorkspaceRedirect.jsx` | comment sunset |

## 3. Thiết kế & trách nhiệm

**Pagination naming** (workspace rule): không dùng `cursor` trong JSON API — `pageToken`, `before`, `nextBefore`.

**authService:** TODO hiện tại line ~246 — gọi `/api/auth/refresh` khi 401 + có refresh token, single-flight tránh storm.

## 4. Thứ tự triển khai

1. Audit client grep `page=` trên messages/notifications
2. Chuyển sang pageToken parsers có sẵn
3. `taskAPI`: `VITE_TASK_API_MODE=workspace` staging
4. Implement refresh interceptor + test logout/revoke
5. Ghi sunset legacy paths (ví dụ `/w/:slug` → 6 tháng)

## 5. Test plan

- Scroll load messages — không gửi `page`
- Notifications infinite scroll — `before`/`nextBefore`
- Task kanban workspace org — không fallback legacy board
- Access token expired → refresh → request retry OK
- Refresh revoked → logout

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Refresh loop | Single-flight + max retry 1 | Disable interceptor flag |
| Task workspace thiếu feature | So sánh legacy board trước cutover | `VITE_TASK_API_MODE=dual` |
