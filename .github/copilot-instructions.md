# AI Agent Instructions for ESPLUS ERP

This file gives concise, actionable context for AI coding agents working in this repository.

## Architecture
- **Backend**: Kotlin 2.0 / Spring Boot 3.3 / JVM 21 — `src/main/kotlin/`
- **Frontend**: Next.js 16 (App Router) / React 19 / TypeScript — `apps/web/`
- **Database**: PostgreSQL 16 + Redis (caching/sessions)
- **i18n**: next-intl 4 (EN/ZH/VI) — `packages/shared/i18n/`
- **Architecture Pattern**: DDD layered (api → application → domain → infrastructure)

## Key Paths
| Path | Purpose |
|------|---------|
| `src/main/kotlin/com/mgmt/` | Backend source |
| `apps/web/src/` | Frontend source |
| `packages/shared/i18n/locales/` | i18n JSON files |
| `src/main/resources/` | Spring Boot config + Flyway migrations |

## Developer Commands
```bash
# Start backend
./gradlew bootRun

# Start frontend
cd apps/web && pnpm dev

# Both (via Turborepo)
pnpm dev
```

## Iron Rules
- **R0**: DROP/TRUNCATE/DELETE/migrate reset — never auto-execute
- **R1**: All dates use `America/Los_Angeles` timezone
- **R2**: Minimal changes only — don't modify beyond what's requested
