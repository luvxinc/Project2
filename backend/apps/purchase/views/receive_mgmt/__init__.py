"""
入库管理视图模块
包含：页面渲染、列表查询、详情查询、修改、历史记录、删除/恢复、文件上传
"""

# 页面
from .page import receive_mgmt_page

# 查询API
from .list import receive_list_api
from .detail import receive_detail_api

# 修改API
from .edit import receive_edit_submit_api

# 历史记录API
from .history import get_receive_history_api

# 删除/恢复API
from .delete import submit_receive_delete_api, submit_receive_undelete_api

# 文件上传API
from .upload import upload_receive_file_api, get_receive_file_info_api, serve_receive_file_api, delete_receive_file_api

__all__ = [
    'receive_mgmt_page',
    'receive_list_api',
    'receive_detail_api',
    'receive_edit_submit_api',
    'get_receive_history_api',
    'submit_receive_delete_api',
    'submit_receive_undelete_api',
    'upload_receive_file_api',
    'get_receive_file_info_api',
    'serve_receive_file_api',
    'delete_receive_file_api',
]

