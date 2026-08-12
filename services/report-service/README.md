# report-service

Xem [ADR-003](../../docs/architecture/ADR-003-report-olap.md) và [ADR-005](../../docs/architecture/ADR-005-dashboard-read-model.md).

## Dashboard Read Model

- `GET /api/reports/v1/dashboard/me` — BFF/gateway trust + `x-user-id`
- `GET /internal/reports/v1/dashboard/:userId` — internal token
- Consumer: `ENABLE_DASHBOARD_PROJECTION_CONSUMER=true` + `RABBITMQ_URL`
- Store: Redis `dash:rm:user:{userId}` (hoặc memory nếu `DASHBOARD_RM_MEMORY=true`)
- Snapshot nền gọi org/friend/notif/voice/task **không** trên request user

Gateway BFF: `DASHBOARD_READ_MODEL=fallback|on` + `REPORT_SERVICE_URL`.

Không share DB OLTP với project/task.
