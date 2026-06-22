---
name: s1-gateway-permissions
overview: S1c — Đóng permission gap gateway (deny route chưa map), chạy full security regression smoke.
todos:
  - id: permission-gap-audit
    content: Liệt kê route /api/* chưa có action trong permission.middleware / permissions.js
    status: completed
  - id: deny-unmapped
    content: Route mới/không map → 403 (hoặc whitelist public rõ)
    status: completed
  - id: security-smoke-full
    content: Chạy devops/scripts/security-regression-smoke.md đầy đủ
    status: completed
isProject: false
---

# S1c — Gateway Permission Gap

**Phụ thuộc:** [s1-internal-tokens.plan.md](s1-internal-tokens.plan.md)  
**Tiếp theo:** [realtime/s2-socket-canonical.plan.md](../realtime/s2-socket-canonical.plan.md)  
**Tiêu chí:** An toàn

## 1. Mục tiêu & phạm vi

### Done
- Không còn route protected đi qua gateway mà `getAction` falsy → `next()` im lặng
- Full security regression smoke pass (auth, IDOR friends/documents/meetings, chat ACL, concurrency)

### In-scope
- [`api-gateway/src/middlewares/permission.middleware.js`](../../../api-gateway/src/middlewares/permission.middleware.js)
- [`api-gateway/src/config/permissions.js`](../../../api-gateway/src/config/permissions.js)

### Out-of-scope
- Đổi JWT contract
- Rate limit edge (P2)

## 2. Files affected

**Sửa:** `permission.middleware.js`, `permissions.js` (bổ sung map thiếu)  
**Không đụng:** `auth.middleware.js` (trừ bug blocker)

## 3. Thiết kế & trách nhiệm

| Hành vi | Mô tả |
|---------|-------|
| Public routes | Đã khai báo trong `services.js` — không qua permission |
| Protected + có action | Gọi role-permission-service |
| Protected + **không** action | **403** (fail-closed) thay vì proxy |

`role.service.js` đã chọn fail-closed cho network error — giữ nguyên.

## 4. Thứ tự triển khai

1. Script/grep: liệt kê tất cả proxy prefix vs permissions map
2. Bổ sung action thiếu hoặc đánh dấu public có chủ đích
3. Đổi middleware: unmapped → 403 + log warn (staging)
4. Chạy security smoke toàn bộ
5. Fix regression nếu route hợp lệ bị chặn nhầm

## 5. Test plan

[`devops/scripts/security-regression-smoke.md`](../../../devops/scripts/security-regression-smoke.md) — toàn bộ mục Auth, IDOR, Chat/AI, Concurrency.

```bash
bash devops/scripts/check-security-env.sh
```

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Chặn nhầm route legacy client | Audit trước; fix map trước khi deny | Revert middleware; giữ log-only mode 1 sprint |
| 403 tăng đột biến prod | Chỉ bật deny sau audit staging | Feature flag `PERMISSION_DENY_UNMAPPED` |
