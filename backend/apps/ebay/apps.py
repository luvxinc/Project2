# File: backend/apps/ebay/apps.py
"""
eBay Integration App Configuration
"""
from django.apps import AppConfig


class EbayConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backend.apps.ebay'
    verbose_name = 'eBay Integration'
