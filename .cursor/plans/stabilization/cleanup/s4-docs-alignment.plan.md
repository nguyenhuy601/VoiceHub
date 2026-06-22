---
name: s4-docs-alignment
overview: "S4c — Đồng bộ tài liệu với thực tế Swarm: ARCHITECTURE, MIGRATION, SYSTEM-SPEC; đóng stabilization phase."
todos:
  - id: update-architecture
    content: ARCHITECTURE.md — Swarm path thực tế, socket canonical
    status: completed
  - id: update-migration
    content: MIGRATION.md — ghi rõ K8s/Consul là tương lai, không lệch code
    status: completed
  - id: update-system-spec
    content: 01-SYSTEM-SPEC.md — §9 realtime, §10 limitations cập nhật
    status: completed
  - id: stabilization-signoff
    content: Checklist sign-off master index — 4 tiêu chí pass
    status: completed
isProject: false
---

# S4c — Documentation Alignment & Sign-off

**Phụ thuộc:** [s4-api-pagination-client.plan.md](s4-api-pagination-client.plan.md)  
**Tiếp theo:** `devops/swarm/ha-infra-roadmap.md` Phase 2 (ngoài stabilization)  
**Tiêu chí:** Sạch sẽ

## 1. Mục tiêu & phạm vi

### Done
- Docs không mô tả K8s/chat-system tách làm path hiện tại
- Spec khớp socket-service canonical
- Master index 4 tiêu chí đánh dấu pass

### In-scope
- [`ARCHITECTURE.md`](../../../ARCHITECTURE.md)
- [`MIGRATION.md`](../../../MIGRATION.md)
- [`docs/spec-pack/01-SYSTEM-SPEC.md`](../../../docs/spec-pack/01-SYSTEM-SPEC.md)
- [`README.md`](../../../README.md) (deploy section nếu lệch)

### Out-of-scope
- Viết docs mới không cần thiết (user rule: không tạo markdown trừ khi cần)

## 2. Files affected

Chỉ các file docs liệt kê — sửa section deployment, realtime, limitations.

## 3. Thiết kế & trách nhiệm

| Doc | Sửa gì |
|-----|--------|
| ARCHITECTURE | Production = Docker Swarm; diagram realtime 1 path |
| MIGRATION | K8s/Eureka = future; link stabilization folder |
| SYSTEM-SPEC §9 | socket-service only; chat socket removed |
| SYSTEM-SPEC §10 | Bỏ "2 realtime channel" sau S2 |

## 4. Thứ tự triển khai

1. Đọc docs vs code sau S0–S4b
2. Patch từng file — diff nhỏ, factual
3. Master index: tick success criteria
4. PR stabilization sign-off với link tất cả plan

## 5. Test plan

- Reviewer đọc ARCHITECTURE + spec — không thấy mâu thuẫn với `docker-stack.yml`
- Onboarding dev mới deploy Swarm theo README — không cần K8s

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Docs drift lại sau | Link plan folder trong README | Quarterly doc audit |

## Sign-off checklist (master index)

- [ ] S0 baseline file tồn tại
- [ ] S1 security smoke pass
- [ ] S2 chat-service không WS public
- [ ] S3 HA + chaos pass
- [ ] S4 deprecated routes gỡ
- [ ] Docs aligned
