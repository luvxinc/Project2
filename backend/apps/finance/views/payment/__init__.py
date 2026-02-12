# File: backend/apps/finance/views/payment/__init__.py
"""
物流付款模块 - 聚合器
维持与原 payment.py 相同的导出接口，确保 urls.py 无需修改
"""

from .submit import submit_payment_api, delete_payment_api, restore_payment_api
from .file_ops import (
    check_payment_files_api,
    get_payment_files_api,
    upload_payment_file_api,
    serve_payment_file_api,
    delete_payment_file_api
)
from .history import (
    payment_history_api,
    payment_orders_api
)


__all__ = [
    # submit.py
    'submit_payment_api',
    'delete_payment_api',
    'restore_payment_api',
    # file_ops.py
    'check_payment_files_api',
    'get_payment_files_api',
    'upload_payment_file_api',
    'serve_payment_file_api',
    'delete_payment_file_api',
    # history.py
    'payment_history_api',
    'payment_orders_api',
]
