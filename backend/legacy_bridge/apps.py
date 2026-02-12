from django.apps import AppConfig


class LegacyBridgeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backend.legacy_bridge'
