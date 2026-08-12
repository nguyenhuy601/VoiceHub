## Tuân thủ rules (bắt buộc — mọi plan & implement)

Mọi agent/human triển khai theo plan trong `.cursor/plans/` **phải** tuân thủ:

| Rule | File |
|------|------|
| **Senior Full-stack (quy trình + chất lượng)** | [.cursor/rules/senior-dev-engineering.mdc](../rules/senior-dev-engineering.mdc) |
| VoiceHub bảo mật, env, microservice, test done | [.cursor/rules/voicehub-constraints.mdc](../rules/voicehub-constraints.mdc) |
| Clean code, diff tối thiểu | [.cursor/rules/clean-code.mdc](../rules/clean-code.mdc) |

### Trước khi code (theo senior-dev-engineering)

1. Phân tích yêu cầu → 2. Phạm vi → 3. File list → 4. Kế hoạch ngắn → 5. Code.

Ngoài phạm vi plan: giải thích + đề xuất — **không tự sửa**.

### Ràng buộc mặc định (trừ khi plan ghi rõ in-scope)

- Không đổi API contract, routing, auth flow, schema DB ngoài plan.
- Không refactor drive-by; không TODO / `console.log` / debug tạm.
- FE: loading / empty / error; BE: validate + service layer.
- **Hoàn tất plan:** chạy đủ test plan (§5); `npm run build` nếu sửa `client/`; báo bảng pass/fail.

### Thứ tự ưu tiên rules

`voicehub-constraints` (bảo mật/env) > `senior-dev-engineering` (quy trình) > `clean-code` > nội dung plan cụ thể.
