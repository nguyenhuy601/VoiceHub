# task-service (scaffold)

Xem [ADR-001](../../docs/architecture/ADR-001-task-service-split.md).

- **Hiện tại:** CRUD Task vẫn thuộc `project-service`. Service này chỉ health + strangler-status.
- **Cutover:** deploy Swarm, set `TASK_SERVICE_URL=http://task-service:3019`, `TASK_SERVICE_STRANGLER_MODE=cutover` sau khi migrate ownership.
- **Events:** `@enterprise/shared/messaging/taskDomainEvents`

Không đăng ký vào `docker-stack.yml` cho đến khi có image + migration plan.
