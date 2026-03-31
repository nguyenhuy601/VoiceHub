# Docker Compose — cấu trúc

| File | Vai trò |
|------|---------|
| `docker-compose.yml` | **Entry mặc định** — `include` infra + core (một lệnh chạy DB + toàn bộ app) |
| `docker-compose.infra.yml` | MongoDB, Redis, volumes, network |
| `docker-compose.core.yml` | API Gateway + microservices (build + mount) |
| `docker-compose.dev.yml` | Nodemon, `CHOKIDAR_*`, `uvicorn --reload` (tùy chọn) |

Yêu cầu **Docker Compose v2.24+** (hỗ trợ `include`).

## Lệnh thường dùng

**Full stack (Mongo + Redis + app, không hot reload):**
```bash
docker compose up -d --build
```

**Full stack + dev (hot reload như trước):**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

**Chỉ hạ tầng:**
```bash
docker compose -f docker-compose.infra.yml up -d
```

**Chỉ core (Mongo/Redis phải đã chạy sẵn):**
```bash
docker compose -f docker-compose.core.yml up -d --build
```

**Ghép tay thủ công (tương đương `docker compose up`):**
```bash
docker compose -f docker-compose.infra.yml -f docker-compose.core.yml up -d --build
```

## Máy RAM thấp khi build

```bash
export COMPOSE_PARALLEL_LIMIT=1
export DOCKER_BUILDKIT=1
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
```

(Windows: `set COMPOSE_PARALLEL_LIMIT=1`)

## Biến môi trường

- Root `.env`: `USER_SERVICE_INTERNAL_TOKEN`, v.v. (Compose đọc để `${...}`)

## Lưu ý

- File `docker-compose.override.yml` đã bỏ — Compose **không** tự merge dev; phải thêm `-f docker-compose.dev.yml`.

## Sửa lỗi build: `parent snapshot ... does not exist: not found`

Thường gặp trên **Docker Desktop (Windows)** khi build **nhiều image song song** — cache layer BuildKit/containerd lệch.

**Thử theo thứ tự:**

1. **Giới hạn build song song** rồi build lại:
   ```bash
   set COMPOSE_PARALLEL_LIMIT=1
   docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache
   ```
   (Git Bash: `export COMPOSE_PARALLEL_LIMIT=1`)

2. **Dọn cache builder**:
   ```bash
   docker builder prune -af
   docker buildx prune -af
   ```

3. **Khởi động lại Docker Desktop** (WSL2 backend đôi khi cần).

4. Nếu vẫn lỗi, build thử **tắt BuildKit** một lần:
   ```bash
   set DOCKER_BUILDKIT=0
   set COMPOSE_DOCKER_CLI_BUILD=0
   docker compose -f docker-compose.yml -f docker-compose.dev.yml build
   ```

5. Kiểm tra **ổ đĩa còn trống** (image layer cần dung lượng khi export).
