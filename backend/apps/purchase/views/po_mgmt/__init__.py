"""
采购订单管理视图模块
拆分为多个子模块便于维护：
- page: 页面渲染
- list: 订单列表查询
- detail: 订单详情
- history: 历史记录
- edit: 订单编辑
- delete: 删除/恢复
- invoice: 账单文件
"""

# 页面
from .page import po_mgmt_page

# 列表查询
from .list import po_list_api, supplier_list_for_filter_api

# 详情
from .detail import po_detail_api, download_po_excel_api

# 历史
from .history import get_po_history_api

# 编辑
from .edit import get_po_for_edit_api, get_sku_list_api, submit_po_modification_api

# 删除/恢复
from .delete import submit_po_delete_api, submit_po_undelete_api

# 账单文件
from .invoice import upload_po_invoice_api, get_invoice_info_api, serve_invoice_file_api, delete_po_invoice_api

__all__ = [
    'po_mgmt_page',
    'po_list_api',
    'supplier_list_for_filter_api',
    'po_detail_api',
    'download_po_excel_api',
    'get_po_history_api',
    'get_po_for_edit_api',
    'get_sku_list_api',
    'submit_po_modification_api',
    'submit_po_delete_api',
    'submit_po_undelete_api',
    'upload_po_invoice_api',
    'get_invoice_info_api',
    'serve_invoice_file_api',
    'delete_po_invoice_api',
]
