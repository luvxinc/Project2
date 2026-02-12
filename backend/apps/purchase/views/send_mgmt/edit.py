"""
发货单管理 - 发货单物流信息修改
"""
import logging

import json
from datetime import date as date_type
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET, require_http_methods

from ..hub import check_perm
from core.components.db.client import DBClient
from core.services.security.policy_manager import SecurityPolicyManager
from apps.purchase.utils import inject_security_codes_to_post
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_GET
def get_po_for_edit_api(request):
    """
    获取发货单物流信息（用于修改物流向导）
    URL: /dashboard/purchase/api/send_mgmt/edit_data/?logistic_num=xxx
    
    返回:
    - logistics: 最新物流信息（可编辑）
    - base: 基础信息
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '').strip()
    if not logistic_num:
        return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
    
    try:
        # 1. 获取物流单信息（seq数字最大的）
        logistics_df = DBClient.read_df("""
            SELECT 
                logistic_num,
                date_sent,
                date_eta,
                pallets,
                total_weight,
                price_kg,
                total_price,
                usd_rmb,
                mode,
                seq,
                `by`,
                date_record,
                note,
                CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
            FROM in_send 
            WHERE logistic_num = :logistic_num
            ORDER BY seq_num DESC
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        if logistics_df.empty:
            return JsonResponse({'success': False, 'message': _('发货单不存在')}, status=404)
        
        row = logistics_df.iloc[0]
        current_seq = row['seq']
        
        # 2. 获取发货日期（用于验证预计到货日期）
        date_sent = str(row['date_sent']) if row['date_sent'] else ''
        
        # 3. 构建物流信息
        logistics = {
            'seq': current_seq,
            'date_eta': str(row['date_eta']) if row['date_eta'] else '',
            'pallets': int(row['pallets']) if row['pallets'] else 0,
            'price_kg': float(row['price_kg']) if row['price_kg'] else 0,
            'total_weight': float(row['total_weight']) if row['total_weight'] else 0,
            'total_price': float(row['total_price']) if row['total_price'] else 0,
            'usd_rmb': float(row['usd_rmb']) if row['usd_rmb'] else 0,
            'mode': row['mode'] or 'A',  # A=自动获取, M=手动填写
            'note': row['note'] or ''
        }
        
        return JsonResponse({
            'success': True,
            'data': {
                'logistic_num': logistic_num,
                'date_sent': date_sent,
                'current_seq': current_seq,
                'logistics': logistics
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取发货单数据失败: %(error)s') % {'error': str(e)}
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_sku_list_api(request):
    """
    获取SKU列表（保留接口兼容性，但发货单修改暂不需要）
    URL: /dashboard/purchase/api/send_mgmt/sku_list/
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    try:
        df = DBClient.read_df("""
            SELECT DISTINCT SKU FROM Data_COGS ORDER BY SKU
        """)
        
        sku_list = df['SKU'].tolist() if not df.empty else []
        
        return JsonResponse({
            'success': True,
            'data': sku_list
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': _('获取SKU列表失败: %(error)s') % {'error': str(e)}
        }, status=500)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_po_modification_api(request):
    """
    提交发货单物流信息修改
    URL: POST /dashboard/purchase/api/send_mgmt/submit_modify/
    
    请求体:
    {
        "logistic_num": "LOG20251229-001",
        "logistics": {
            "date_eta": "2025-01-05",
            "pallets": 10,
            "price_kg": 12.5,
            "total_weight": 500,
            "usd_rmb": 7.25,
            "note": "修改备注"
        }
    }
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    try:
        data = json.loads(request.body)
        
        # [Security] 将 JSON body 中的安全码注入到 POST 以便验证
        inject_security_codes_to_post(request, data)
        
        # [Security] 安全策略验证
        is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, 'btn_send_modify')
        if not is_valid:
            return JsonResponse({'success': False, 'message': sec_msg}, status=403)
        
        logistic_num = data.get('logistic_num', '').strip()
        logistics = data.get('logistics', {})
        
        if not logistic_num:
            return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
        
        # 验证发货单存在并获取当前最大seq
        max_seq_df = DBClient.read_df("""
            SELECT 
                MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num,
                date_sent, mode
            FROM in_send
            WHERE logistic_num = :logistic_num
            GROUP BY logistic_num, date_sent, mode
        """, {'logistic_num': logistic_num})
        
        if max_seq_df.empty:
            return JsonResponse({'success': False, 'message': _('发货单不存在')}, status=404)
        
        max_num = int(max_seq_df.iloc[0]['max_num']) if max_seq_df.iloc[0]['max_num'] else 0
        date_sent = max_seq_df.iloc[0]['date_sent']
        mode = max_seq_df.iloc[0]['mode'] or 'A'
        
        new_seq = f"S{str(max_num + 1).zfill(2)}"
        today = date_type.today().isoformat()
        operator = request.user.username
        
        # 计算物流总价
        price_kg = float(logistics.get('price_kg', 0))
        total_weight = float(logistics.get('total_weight', 0))
        total_price = round(price_kg * total_weight, 5)
        
        # 插入新的物流信息版本
        DBClient.execute_stmt("""
            INSERT INTO in_send 
            (logistic_num, date_sent, date_eta, pallets, total_weight, price_kg, total_price, usd_rmb, mode, seq, `by`, date_record, note)
            VALUES 
            (:logistic_num, :date_sent, :date_eta, :pallets, :total_weight, :price_kg, :total_price, :usd_rmb, :mode, :seq, :by_user, :date_record, :note)
        """, {
            'logistic_num': logistic_num,
            'date_sent': date_sent,
            'date_eta': logistics.get('date_eta', ''),
            'pallets': int(logistics.get('pallets', 0)),
            'total_weight': total_weight,
            'price_kg': price_kg,
            'total_price': total_price,
            'usd_rmb': float(logistics.get('usd_rmb', 0)),
            'mode': mode,
            'seq': new_seq,
            'by_user': operator,
            'date_record': today,
            'note': logistics.get('note', '')
        })
        
        return JsonResponse({
            'success': True,
            'message': _('发货单物流信息修改成功'),
            'data': {
                'logistic_num': logistic_num,
                'new_seq': new_seq
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('提交修改失败: %(error)s') % {'error': str(e)}
        }, status=500)
