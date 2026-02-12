# File: backend/apps/finance/views/__init__.py
"""
财务板块视图包
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils.translation import gettext as _

from core.services.auth.service import AuthService
from core.components.db.client import DBClient
import logging

logger = logging.getLogger(__name__)


def _check_perm(user, perm_key: str) -> bool:
    """检查用户是否有精确的权限 key"""
    if user.is_superuser:
        return True
    user_perms = AuthService.get_permissions(user.username)
    return perm_key in user_perms


def _get_hub_badge_counts():
    """
    获取 Hub 页面各功能的待处理数量
    Returns:
        dict: {logistic: int, deposit: int, po: int}
    """
    counts = {'logistic': 0, 'deposit': 0, 'po': 0}
    
    try:
        # 1. 物流财务 - 待付物流单数量
        # 未支付的物流单: in_send_final 中存在但 in_pmt_logistic_final 中不存在的物流单号
        logistic_df = DBClient.read_df("""
            SELECT COUNT(DISTINCT s.sent_logistic_num) as cnt
            FROM in_send_final s
            LEFT JOIN in_pmt_logistic_final p ON s.sent_logistic_num = p.logistic_num
            WHERE p.logistic_num IS NULL
        """)
        if not logistic_df.empty:
            counts['logistic'] = int(logistic_df.iloc[0]['cnt'] or 0)
        
        # 2. 定金付款 - 待付定金订单数量
        # 需要支付定金但未付清的订单
        deposit_df = DBClient.read_df("""
            SELECT COUNT(DISTINCT pf.po_num) as cnt
            FROM in_po_final pf
            INNER JOIN in_po_strategy s ON pf.po_num = s.po_num
            LEFT JOIN (
                SELECT po_num, SUM(dep_paid + dep_prepay_amount) as total_paid, MAX(dep_override) as has_override
                FROM in_pmt_deposit_final
                GROUP BY po_num
            ) dep ON pf.po_num = dep.po_num
            WHERE s.seq = (SELECT MAX(seq) FROM in_po_strategy WHERE po_num = s.po_num)
              AND s.cur_deposit = 1 
              AND s.cur_deposit_par > 0
              AND (dep.has_override IS NULL OR dep.has_override = 0)
              AND (
                  dep.total_paid IS NULL 
                  OR dep.total_paid < (
                      SELECT SUM(po_quantity * po_price) * s.cur_deposit_par / 100
                      FROM in_po_final 
                      WHERE po_num = pf.po_num
                  )
              )
        """)
        if not deposit_df.empty:
            counts['deposit'] = int(deposit_df.iloc[0]['cnt'] or 0)
        
        # 3. 订单付款 - 待付尾款订单数量
        # 存在订单但未完全支付的（排除有未解决差异的订单）
        po_df = DBClient.read_df("""
            SELECT COUNT(DISTINCT pf.po_num) as cnt
            FROM in_po_final pf
            LEFT JOIN (
                SELECT po_num, 
                       SUM(dep_paid + dep_prepay_amount) as deposit_paid,
                       MAX(dep_override) as dep_override
                FROM in_pmt_deposit_final
                GROUP BY po_num
            ) dep ON pf.po_num = dep.po_num
            LEFT JOIN (
                SELECT po_num,
                       SUM(pmt_cash_amount + pmt_prepay_amount) as po_paid,
                       MAX(pmt_override) as pmt_override
                FROM in_pmt_po_final
                GROUP BY po_num
            ) po ON pf.po_num = po.po_num
            LEFT JOIN (
                SELECT po_num, SUM(ABS(diff_quantity)) as unresolved_diff
                FROM in_diff_final
                WHERE diff_quantity != 0
                GROUP BY po_num
            ) diff ON pf.po_num = diff.po_num
            WHERE (diff.unresolved_diff IS NULL OR diff.unresolved_diff = 0)
              AND (po.pmt_override IS NULL OR po.pmt_override = 0)
              AND (
                  (SELECT SUM(po_quantity * po_price) FROM in_po_final WHERE po_num = pf.po_num)
                  - COALESCE(dep.deposit_paid, 0)
                  - COALESCE(po.po_paid, 0)
              ) > 0
        """)
        if not po_df.empty:
            counts['po'] = int(po_df.iloc[0]['cnt'] or 0)
            
    except Exception as e:
        logger.warning(f"[FinanceHub] Failed to get badge counts: {e}")
    
    return counts


@login_required(login_url='web_ui:login')
def finance_hub(request):
    """财务板块 Hub 页面"""
    perms = AuthService.get_permissions(request.user.username)
    
    # 物流财务管理权限 (默认开放查看)
    can_logistic = request.user.is_superuser or True
    
    # 预付款管理权限 (默认开放查看)
    can_prepay = request.user.is_superuser or True
    
    # 定金付款管理权限 (默认开放查看)
    can_deposit = request.user.is_superuser or True

    # 订单付款管理权限 (默认开放查看)
    can_po = request.user.is_superuser or True
    
    # 获取待处理数量
    badge_counts = _get_hub_badge_counts()
    
    hub_items = [
        {
            'id': 'logistic',
            'name': _('物流财务管理'),
            'icon': 'fas fa-truck-loading',
            'desc': _('管理物流费用，查看付款状态，进行批量付款操作。'),
            'url': '/dashboard/finance/logistic/',
            'has_access': can_logistic,
            'badge': badge_counts.get('logistic', 0)
        },
        {
            'id': 'prepay',
            'name': _('厂商预付款管理'),
            'icon': 'fas fa-wallet',
            'desc': _('管理厂商预付款账户，查看余额和交易流水。'),
            'url': '/dashboard/finance/prepay/',
            'has_access': can_prepay,
            'badge': 0  # 预付款不需要 badge
        },
        {
            'id': 'deposit',
            'name': _('定金付款管理'),
            'icon': 'fas fa-hand-holding-usd',
            'desc': _('管理订货单定金，查看付款状态，进行批量付款操作。'),
            'url': '/dashboard/finance/deposit/',
            'has_access': can_deposit,
            'badge': badge_counts.get('deposit', 0)
        },
        {
            'id': 'po',
            'name': _('订单付款管理'),
            'icon': 'fas fa-money-check-alt',
            'desc': _('管理订单尾款，查看付款状态，进行批量付款操作。'),
            'url': '/dashboard/finance/po/',
            'has_access': can_po,
            'badge': badge_counts.get('po', 0)
        },
        {
            'id': 'flow',
            'name': _('定发收总预览'),
            'icon': 'fas fa-stream',
            'desc': _('订单全生命周期概览，查看定金、货款、物流费用及摊销汇总。'),
            'url': '/dashboard/finance/flow/',
            'has_access': True,
            'badge': 0  # 预览页面不需要 badge
        },
    ]
    
    return render(request, 'finance/hub.html', {
        'hub_items': hub_items,
    })

