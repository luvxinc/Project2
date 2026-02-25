# ESPLUS ERP V3.0

Enterprise Resource Planning system for cross-border e-commerce operations.

## Architecture

| Layer | Technology | Port |
|-------|-----------|------|
| Frontend | Next.js 16 / React 19 / TypeScript | 3000 |
| Backend | Kotlin 2.0 / Spring Boot 3.3 / JVM 21 | 8080 |
| Database | PostgreSQL 16 | 5432 |
| Cache | Redis 7 | 6379 |
| i18n | next-intl 4 (EN / ZH / VI) | — |

## Quick Start

### Docker (Recommended)

```bash
# 1. Copy environment config
cp .env.example .env
# Edit .env with your values

# 2. Start all services
docker compose up -d

# 3. Access
# Frontend: http://localhost:3000
# Backend:  http://localhost:8080/api/v1/health
```

### Local Development

```bash
# Prerequisites: JDK 21, Node 22, pnpm 10, PostgreSQL 16, Redis 7

# Start backend
./gradlew bootRun

# Start frontend (in another terminal)
cd apps/web && pnpm dev

# Or start both via script
bash dev/start_dev.sh
```

## Project Structure

```
├── src/                    # Backend (Kotlin / Spring Boot)
│   └── main/
│       ├── kotlin/com/mgmt/   # DDD: api → application → domain → infrastructure
│       └── resources/          # Config + Flyway migrations
├── apps/web/               # Frontend (Next.js)
│   └── src/
│       ├── app/               # App Router pages
│       ├── components/        # Shared UI components
│       └── lib/               # API utilities
├── packages/shared/        # Shared i18n locales
├── dev/                    # Dev scripts (start/stop)
├── Dockerfile.backend      # Backend container
├── Dockerfile.frontend     # Frontend container
└── docker-compose.yml      # Full-stack orchestration
```

## Modules

| Module | Status | Description |
|--------|--------|-------------|
| Users & Auth | ✅ Production | RBAC, JWT, 4-level security codes |
| Purchase | ✅ Production | Suppliers, POs, shipments, receiving |
| Finance | ✅ Production | Payments, deposits, logistics, flow overview |
| Sales | ✅ Production | ETL pipeline, reports, analytics |
| Inventory | ✅ Production | Dynamic FIFO, stocktake, 3D shelf |
| Products | ✅ Production | Catalog, COGS, barcode generation |
| VMA | ✅ Production | Valve management, clinical cases, training |
| Logs | ✅ Production | 4-table audit system |
| DB Admin | ✅ Production | Backup, restore, data management |

## Environment Variables

See [`.env.example`](.env.example) for all available configuration options.

## License

Copyright © 2026 Aaron. All rights reserved.
