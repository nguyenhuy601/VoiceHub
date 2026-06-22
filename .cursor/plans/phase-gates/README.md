# Phase Gates — VoiceHub

**Cổng (gate)** bắt buộc chạy **trước khi** bắt đầu phase hạ tầng kế tiếp.

Mỗi gate gồm:
1. **Bug & regression** — smoke + issue P0/P1
2. **Plan completion** — mọi plan con phase vừa xong
3. **Sign-off** — Dev lead approve (checkbox trong gate doc)

## Bắt đầu tại

**[00-master-index.plan.md](./00-master-index.plan.md)**

## Các cổng

| Gate | Từ → Đến | Plan |
|------|----------|------|
| G0 | Stabilization → Phase 1 | [gate-s0-to-p1](gates/gate-s0-to-p1.plan.md) |
| G1 | Phase 1 → Phase 2 | [gate-p1-to-p2](gates/gate-p1-to-p2.plan.md) |
| G2 | Phase 2 → Phase 3+ | [gate-p2-to-p3](gates/gate-p2-to-p3.plan.md) |

**Quy tắc:** Không implement plan đầu tiên của phase mới cho đến khi gate tương ứng **PASS** (hoặc waive có ghi lý do).
