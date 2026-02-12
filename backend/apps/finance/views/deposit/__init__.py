# File: backend/apps/finance/views/deposit/__init__.py
"""
定金付款管理视图包
"""
from .api import (
    deposit_page,
    deposit_list_api,
    deposit_payment_submit,
    deposit_receipt_upload_api,
    get_vendor_balance_api,
    deposit_file_list_api,
    deposit_file_serve_api,
    deposit_file_delete_api,
    deposit_orders_api,
    deposit_history_api,
    deposit_payment_delete_api,
)

__all__ = [
    'deposit_page',
    'deposit_list_api',
    'deposit_payment_submit',
    'deposit_receipt_upload_api',
    'get_vendor_balance_api',
    'deposit_file_list_api',
    'deposit_file_serve_api',
    'deposit_file_delete_api',
    'deposit_orders_api',
    'deposit_history_api',
    'deposit_payment_delete_api',
]
