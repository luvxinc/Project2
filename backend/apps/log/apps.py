# File: backend/apps/log/apps.py
from django.apps import AppConfig


class LogConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.log'
    verbose_name = '日志系统'

    def ready(self):
        # 导入信号处理器
        try:
            import apps.log.signals  # noqa
        except ImportError:
            import backend.apps.log.signals  # noqa
