# Copilot / AI Agent Instructions for Eaglestar ERP

This file gives concise, actionable context for AI coding agents working in this repository.

1) Big picture
- Monolithic Django backend lives under `backend/`. The Django settings used at runtime are in `backend/django_config/settings.py` and load shared values from `backend/common/settings.py` (SSOT for DB and secrets).
- Frontend templates and static assets live in `backend/templates/` and `backend/static/` (served via `STATICFILES_DIRS`). The UI layer is `backend.web_ui`.
- Key integration points: `backend.legacy_bridge` (auth + data bridge), `rest_framework` APIs, and many `backend.apps.*` Django apps (reports, visuals, user_admin, db_admin, locking).

2) Developer workflows & common commands
- Use the repo root. Create/activate the project's virtualenv (there is a `.venv/` in the workspace). Install deps: `pip install -r requirements.txt`.
- Run local server: `python backend/manage.py runserver 0.0.0.0:8000` (manage.py sets `DJANGO_SETTINGS_MODULE='django_config.settings'`).
- Database config is provided by `backend.common.settings`. Do not hardcode DB credentials — follow that SSOT.
- Tests: run `pytest` from repo root. Many unit tests live directly under `backend/` and `backend/tests/`.
- Migrations and admin commands: use `python backend/manage.py <command>` (e.g., `migrate`, `createsuperuser`).

3) Project-specific patterns & cautions
- `manage.py` includes a runtime PyMySQL -> MySQLdb shim and a manual `version_info` patch. Avoid changing DB import semantics lightly; keep the shim if you modify DB code (see `backend/manage.py`).
- Shared settings are loaded dynamically: `backend/django_config/settings.py` imports `backend.common.settings`. When changing configuration, update the SSOT file(s) under `backend/common/`.
- Middleware is used for global exception handling and audit logging (`core.middleware.error_middleware.GlobalExceptionMiddleware`, `core.middleware.audit_middleware.AuditOperationMiddleware`). Follow these patterns when adding cross-cutting concerns.
- Some apps are intentionally disabled in `INSTALLED_APPS` (comments in settings). Respect those flags and keep feature toggles consistent with the settings file.

4) Useful file examples (reference when implementing features)
- Django entrypoint: [backend/manage.py](backend/manage.py)
- Runtime settings: [backend/django_config/settings.py](backend/django_config/settings.py)
- Shared app settings: [backend/common/settings.py](backend/common/settings.py)
- Web UI app: [backend/web_ui](backend/web_ui)
- Legacy integration: [backend/legacy_bridge](backend/legacy_bridge)

5) Guidance for code changes
- Prefer adding new functionality inside `backend.apps.<module>` or `core/` following existing app structure.
- For API changes prefer DRF patterns already in use; check `REST_FRAMEWORK` config in settings.
- When modifying templates or static assets, place files under `backend/templates/` and `backend/static/` and verify `TEMPLATES['DIRS']` usage.
- Keep debug settings intact in development branches (`DEBUG = True`) and avoid leaking secrets — follow `backend/common/settings.py` for production-sensitive values.

6) When editing tests
- Look for similar tests in `backend/` (many `test_*.py` exist at the app or root level). Use `pytest -q` and keep tests fast and isolated from production DB (use local test DB or mocks).

7) If something is unclear
- Ask for the expected environment (local vs CI) and whether the change should touch the SSOT under `backend/common/settings.py`.

If you want, I can expand any section or merge existing internal docs into this file — tell me which areas need more detail.
