from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils.translation import gettext as _
from core.services.auth.service import AuthService

def check_perm(user, perm_key: str) -> bool:
    """
    Helper to check permission.
    
    [P0-2 Fix] STRICT leaf-node enforcement:
    - AuthService.get_permissions() already handles parent inference (child implies parent)
    - We do NOT do reverse inference here (having parent does NOT imply having all children)
    """
    if user.is_superuser:
        return True
    
    user_perms = AuthService.get_permissions(user.username)
    # Direct match only - AuthService already handles parent inference
    return user_perms.get(perm_key, False)

@login_required(login_url='web_ui:login')
def purchase_hub(request):
    """采购板块 Hub 页面 - 对齐安全审计日志模块渲染方式"""
    # 检查各子模块/Tab权限
    can_add = check_perm(request.user, 'module.purchase.supplier.add')
    can_strategy = check_perm(request.user, 'module.purchase.supplier.strategy')
    can_po_add = check_perm(request.user, 'module.purchase.po.add')
    can_po_mgmt = check_perm(request.user, 'module.purchase.po.mgmt')
    can_send_add = check_perm(request.user, 'module.purchase.send.add')
    can_send_mgmt = check_perm(request.user, 'module.purchase.send.mgmt')
    can_receive = check_perm(request.user, 'module.purchase.receive')
    can_receive_mgmt = check_perm(request.user, 'module.purchase.receive.mgmt')
    
    # 始终显示所有卡片，通过 has_access 控制锁定状态
    hub_items = [
        {
            'id': 'add_supplier',
            'name': _('新增供应商'),
            'icon': 'fas fa-user-plus',
            'desc': _('创建新的供应商档案'),
            'url': '/dashboard/purchase/add/',
            'has_access': can_add
        },
        {
            'id': 'supplier_strategy',
            'name': _('供应商管理'),
            'icon': 'fas fa-chess-knight',
            'desc': _('查看和修改供应商策略'),
            'url': '/dashboard/purchase/strategy/',
            'has_access': can_strategy
        },
        {
            'id': 'po_add',
            'name': _('新建采购订单'),
            'icon': 'fas fa-file-invoice-dollar',
            'desc': _('创建新的采购订单'),
            'url': '/dashboard/purchase/new_po/',
            'has_access': can_po_add
        },
        {
            'id': 'po_mgmt',
            'name': _('订单管理'),
            'icon': 'fas fa-file-invoice',
            'desc': _('查看和管理采购订单'),
            'url': '/dashboard/purchase/po_mgmt/',
            'has_access': can_po_mgmt
        },
        {
            'id': 'send_add',
            'name': _('新建发货单'),
            'icon': 'fas fa-shipping-fast',
            'desc': _('创建新的发货单'),
            'url': '/dashboard/purchase/new_send/',
            'has_access': can_send_add
        },
        {
            'id': 'send_mgmt',
            'name': _('发货单管理'),
            'icon': 'fas fa-boxes',
            'desc': _('查看和管理发货单'),
            'url': '/dashboard/purchase/send_mgmt/',
            'has_access': can_send_mgmt
        },
        {
            'id': 'receive',
            'name': _('货物入库'),
            'icon': 'fas fa-warehouse',
            'desc': _('接收发货单货物并入库'),
            'url': '/dashboard/purchase/receive/',
            'has_access': can_receive
        },
        {
            'id': 'receive_mgmt',
            'name': _('入库管理'),
            'icon': 'fas fa-clipboard-check',
            'desc': _('查看和管理入库记录'),
            'url': '/dashboard/purchase/receive_mgmt/',
            'has_access': can_receive_mgmt
        },
        {
            'id': 'abnormal',
            'name': _('入库异常处理'),
            'icon': 'fas fa-exclamation-triangle',
            'desc': _('处理入库差异和异常情况'),
            'url': '/dashboard/purchase/abnormal/',
            'has_access': can_receive_mgmt
        }
    ]
            
    return render(request, 'purchase/hub.html', {'hub_items': hub_items})

