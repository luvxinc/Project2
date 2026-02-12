from django.apps import AppConfig

class InventoryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    # [关键] 必须显式指定完整路径名，与 settings.py 保持一致
    name = 'apps.inventory'