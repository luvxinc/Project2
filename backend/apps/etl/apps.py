# File Path: backend/apps/etl/apps.py
from django.apps import AppConfig

class EtlConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    # [修改] 必须加上前缀 apps.
    name = 'apps.etl'