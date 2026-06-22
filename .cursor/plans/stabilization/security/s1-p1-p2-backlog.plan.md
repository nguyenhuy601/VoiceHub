---
name: s1-p1-p2-backlog
overview: Backlog an toàn sau S1 (P1/P2) — không chặn stabilization sign-off. Tham chiếu security-hardening-plan đầy đủ.
todos:
  - id: socket-rate-limit
    content: Rate limit friend:send và event nhạy cảm trên socket-service
    status: completed
  - id: webhook-cors
    content: webhook-service CORS production + gateway route decision
    status: completed
  - id: document-middleware
    content: document-service gateway user middleware end-to-end
    status: completed
  - id: npm-audit
    content: npm audit gateway + client + services
    status: completed
isProject: false
---

# S1+ — Security P1/P2 Backlog (sau stabilization)

**Chạy sau khi:** [s1-gateway-permissions.plan.md](s1-gateway-permissions.plan.md) pass **và** master index sign-off  
**Nguồn đầy đủ:** tạo hoặc sync từ `security-hardening-plan.md` (P1/P2 sections)

## Không thuộc stabilization critical path

Các hạng mục này **không chặn** S2/S3/S4 nhưng nên làm trước production public rộng:

| Ưu tiên | Hạng mục |
|---------|----------|
| P1 | Socket rate limit, payload validation |
| P1 | Webhook CORS + secret |
| P1 | Document-service auth middleware |
| P1 | Voice/task/notification authorization rà soát |
| P2 | WAF edge, metrics 401/403, backup runbook |
| P2 | npm audit / Dependabot |

## 1. Mục tiêu & phạm vi

Done khi P1 checklist trong security-hardening-plan đánh dấu xong.

## 2–6. Chi tiết

Implement từng mục theo file paths trong security-hardening-plan — tách PR riêng từng nhóm (socket, webhook, document).

**Lưu ý workspace rule:** không đổi gateway auth flow trừ khi task yêu cầu — ưu tiên policy trong service.
