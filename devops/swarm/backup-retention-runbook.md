# Backup & Retention Runbook (Phase 6 Wave B)

Ops + product toggles for VoiceHub project soft-archive / retention. **Không** hard-delete production data từ job stub.

## Product toggles

| Control | Where | Default |
|---------|--------|---------|
| Soft-archive project | `POST /api/projects/:projectId/archive` | Sets `isActive=false`, `archivedAt`, `retentionUntil` |
| Org retention policy | Admin → System Config → Retention (`PUT /api/projects/governance/retention`) | `archiveInactiveAfterDays=90`, `defaultRetentionDays=365` |
| Retention job stub | `POST /api/projects/governance/retention/run-stub` `{ dryRun: true }` | Reports expired archives; no Mongo drop |
| Audit writes | `PROJECT_AUDIT_V1` (default on) | Set `0` to no-op AuditEvent writer |

## Default list vs admin

- `GET /api/projects?organizationId=` — **ẩn** archived (`isActive: true` only).
- Admin: `?includeArchived=1` (org owner/admin only) để xem archived.

## Backup (ops)

1. **MongoDB Atlas**: Continuous backup / PITR theo cluster tier; snapshot trước migration lớn.
2. **Swarm secrets / `.env`**: backup vault ngoài repo — không commit secrets.
3. **MinIO / object storage** (nếu dùng `docker-compose.swarm-extra.yml`): snapshot bucket theo lịch riêng.
4. Sau restore DB: `docker service update --force voicehub_project-service` (và services phụ thuộc) nếu image/code lệch.

## Rollback product

- Tắt audit: `PROJECT_AUDIT_V1=0` rồi rolling update `project-service`.
- Ẩn dashboard: gỡ `implementation` nav Director / Audit (hoặc feature flag FE sau).
- Un-archive: hiện chưa có API restore — ops set `isActive=true`, clear `archivedAt` trên document (script có chủ đích).

## Wave C (deferred)

SSO / MFA / IP allowlist: xem `services/auth-service/src/config/securityFeatureFlags.js` — flags mặc định **off**, không đổi login JWT.
