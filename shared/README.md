# @enterprise/shared

Package platform dùng chung cho microservices Node trong VoiceHub. Tổng quan repo: [`../README.md`](../README.md).

**Không** chứa HTTP client gọi service khác (realtime, user profile, webhook, firebase) — các module đó nằm trong `services/<name>/src/clients/` hoặc `src/utils/` của service sở hữu.

## Cấu trúc

```
shared/
├── config/          # mongo, redis
├── middleware/      # auth, cors, gatewayTrust, internalGatewayAuth
├── messaging/       # event contracts (RabbitMQ)
├── cache/           # cross-service cache key contracts
├── pagination/
└── utils/           # logger, fieldCrypto, PII, tokenVersionAuth, ...
```

## Cài đặt

Mỗi service / api-gateway có `postinstall` tự symlink `node_modules/@enterprise/shared` → thư mục `shared/` (script [`postinstall-link.cjs`](postinstall-link.cjs)).

Sau pull, chạy từ root:

```bash
node scripts/sync-node-deps.mjs
```

Hoặc từng service: `npm install` (postinstall chạy tự động).

Docker: mount `./shared:/shared`; lệnh compose chạy `node ../../shared/postinstall-link.cjs` sau `npm install`.

## Import (chuẩn duy nhất)

```javascript
const { connectDB, logger, getRedisClient } = require('@enterprise/shared');
const { mongoose } = require('@enterprise/shared/config/mongo');
const { authenticate } = require('@enterprise/shared/middleware/auth');
const { ORG_EVENT_TYPES } = require('@enterprise/shared/messaging/orgEvents');
```

**Cấm:** `require('/shared')`, `require('/shared/...')`, relative `../../../shared/...`.

## Domain clients (trong từng service)

```javascript
const { emitRealtimeEvent } = require('../clients/realtime.client');
const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
```

## Mã hóa trường (at-rest)

- `ENCRYPTION_MASTER_KEY` trên user-service, chat-service, notification-service, v.v.
- Lazy migration qua `unwrapPlaintext` / `encryptField` — xem `utils/fieldCrypto.js`.
- Test: `cd shared && npm test`
