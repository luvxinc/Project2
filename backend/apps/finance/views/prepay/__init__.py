# File: backend/apps/finance/views/prepay/__init__.py
"""
厂商预付款管理视图包
"""
from .page import prepay_page
from .api import (
    supplier_balance_api,
    transaction_list_api,
    submit_prepay_api,
    prepay_history_api,
    prepay_delete_api,
    prepay_restore_api,

    prepay_file_info_api,
    prepay_serve_file_api,
    prepay_upload_file_api,
    prepay_delete_file_api,
    prepay_rate_api,
)

__all__ = [
    'prepay_page',
    'supplier_balance_api',
    'transaction_list_api',
    'submit_prepay_api',
    'prepay_history_api',
    'prepay_delete_api',
    'prepay_restore_api',

    'prepay_file_info_api',
    'prepay_serve_file_api',
    'prepay_upload_file_api',
    'prepay_delete_file_api',
    'prepay_rate_api',
]

