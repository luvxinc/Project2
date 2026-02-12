"""
发货单管理视图模块
包含：列表查询、详情、历史记录、编辑、删除/恢复、账单管理
"""

# 页面
from .page import send_mgmt_page

# 列表查询 - 使用别名导出
from .list import po_list_api as send_list_api
from .list import supplier_list_for_filter_api as logistic_list_for_filter_api

# 详情
from .detail import po_detail_api as send_detail_api
from .detail import download_po_excel_api as download_send_excel_api

# 历史
from .history import get_send_history_api

# 编辑
from .edit import get_po_for_edit_api as get_send_for_edit_api
from .edit import get_sku_list_api
from .edit import submit_po_modification_api as submit_send_modification_api

# 货物明细编辑
from .edit_items import get_items_for_edit_api
from .edit_items import get_available_po_list_api
from .edit_items import get_available_sku_list_api
from .edit_items import get_available_price_list_api
from .edit_items import submit_items_modification_api

# 删除/恢复
from .delete import submit_send_delete_api
from .delete import submit_send_undelete_api

# 账单文件
from .invoice import upload_po_invoice_api as upload_send_invoice_api
from .invoice import get_invoice_info_api
from .invoice import serve_invoice_file_api
from .invoice import delete_send_invoice_api

__all__ = [
    'send_mgmt_page',
    'send_list_api',
    'logistic_list_for_filter_api',
    'send_detail_api',
    'download_send_excel_api',
    'get_send_history_api',
    'get_send_for_edit_api',
    'get_sku_list_api',
    'submit_send_modification_api',
    # 货物明细编辑
    'get_items_for_edit_api',
    'get_available_po_list_api',
    'get_available_sku_list_api',
    'get_available_price_list_api',
    'submit_items_modification_api',
    # 删除/恢复
    'submit_send_delete_api',
    'submit_send_undelete_api',
    'upload_send_invoice_api',
    'get_invoice_info_api',
    'serve_invoice_file_api',
    'delete_send_invoice_api',
]
