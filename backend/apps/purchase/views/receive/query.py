"""
货物入库 - 查询API

[审计修复 2026-01-02]:
- P1-1: 统一 check_perm 导入
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET

from ..hub import check_perm
from core.components.db.client import DBClient
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_GET
def get_pending_shipments_api(request):
    """
    获取待入库发货单列表
    Permission: module.purchase.receive
    
    GET参数:
        receive_date: 入库日期 (YYYY-MM-DD)
    
    返回:
        {
            success: true,
            shipments: [
                {
                    logistic_num: 物流单号,
                    sent_date: 发货日期,
                    date_eta: 预计到达日期,
                    pallets: 货板数,
                    sent_seq: 版本号,
                    receive_status: 入库状态 (pending/partial/none)
                },
                ...
            ]
        }
    
    逻辑:
        1. 从 in_send_final 中查找 sent_date <= receive_date 的所有记录
        2. 获取 unique 的 sent_logistic_num
        3. 通过 sent_logistic_num + sent_seq 匹配 in_send 表获取 date_eta 和 pallets
        4. 过滤已完成入库的发货单（全部入库或差异已解决）
    """
    if not check_perm(request.user, 'module.purchase.receive'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    receive_date = request.GET.get('receive_date', '')
    if not receive_date:
        return JsonResponse({'success': False, 'message': _('缺少入库日期参数')}, status=400)
    
    try:
        # 1. 从 in_send_final 获取满足条件的发货单列表
        # 按 sent_logistic_num 分组，获取每个发货单的 sent_date 和最新 sent_seq
        shipments_df = DBClient.read_df("""
            SELECT 
                sent_logistic_num,
                sent_date,
                MAX(sent_seq) as sent_seq
            FROM in_send_final
            WHERE sent_date <= :receive_date
            GROUP BY sent_logistic_num, sent_date
            ORDER BY sent_date DESC, sent_logistic_num
        """, {'receive_date': receive_date})
        
        if shipments_df.empty:
            return JsonResponse({
                'success': True,
                'shipments': [],
                'message': _('没有找到待入库的发货单')
            })
        
        logistic_nums = shipments_df['sent_logistic_num'].tolist()
        
        # 2. 获取每个发货单的 date_eta 和 pallets（从 in_send 表）
        send_info_df = DBClient.read_df("""
            SELECT 
                logistic_num,
                date_eta,
                pallets,
                seq
            FROM in_send
            WHERE logistic_num IN :logistic_nums
            ORDER BY logistic_num, seq DESC
        """, {'logistic_nums': tuple(logistic_nums) if logistic_nums else ('',)})
        
        # 构建 logistic_num -> (date_eta, pallets) 映射（取最新 seq）
        send_info_map = {}
        if not send_info_df.empty:
            for _idx, row in send_info_df.iterrows():
                lnum = row['logistic_num']
                if lnum not in send_info_map:
                    send_info_map[lnum] = {
                        'date_eta': str(row['date_eta']) if row['date_eta'] else None,
                        'pallets': int(row['pallets']) if row['pallets'] else 0
                    }
        
        # 3. 获取入库数据 (in_receive_final)
        receive_df = DBClient.read_df("""
            SELECT 
                logistic_num,
                po_num,
                po_sku,
                po_price,
                sent_quantity,
                receive_quantity
            FROM in_receive_final
            WHERE logistic_num IN :logistic_nums
        """, {'logistic_nums': tuple(logistic_nums) if logistic_nums else ('',)})
        
        # 构建 receive 数据 map
        receive_map = {}
        for _idx, row in receive_df.iterrows():
            lnum = row['logistic_num']
            if lnum not in receive_map:
                receive_map[lnum] = {}
            key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
            receive_map[lnum][key] = int(row['receive_quantity']) if row['receive_quantity'] else 0
        
        # 4. 获取发货明细 (in_send_final)
        send_detail_df = DBClient.read_df("""
            SELECT 
                sent_logistic_num,
                po_num,
                po_sku,
                po_price,
                sent_quantity
            FROM in_send_final
            WHERE sent_logistic_num IN :logistic_nums
        """, {'logistic_nums': tuple(logistic_nums) if logistic_nums else ('',)})
        
        # 构建 send 数据 map
        send_detail_map = {}
        for _idx, row in send_detail_df.iterrows():
            lnum = row['sent_logistic_num']
            if lnum not in send_detail_map:
                send_detail_map[lnum] = {}
            key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
            send_detail_map[lnum][key] = int(row['sent_quantity']) if row['sent_quantity'] else 0
        
        # 5. 获取差异状态 (in_diff)
        diff_df = DBClient.read_df("""
            SELECT 
                logistic_num,
                po_num,
                po_sku,
                status,
                seq,
                CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
            FROM in_diff
            WHERE logistic_num IN :logistic_nums
            ORDER BY logistic_num, po_num, po_sku, seq_num DESC
        """, {'logistic_nums': tuple(logistic_nums) if logistic_nums else ('',)})
        
        # 构建 diff 状态 map (只取每个 po_sku 的最新 seq)
        diff_status_map = {}
        seen_keys = set()
        for _idx, row in diff_df.iterrows():
            lnum = row['logistic_num']
            key = (lnum, row['po_num'], row['po_sku'])
            if key in seen_keys:
                continue
            seen_keys.add(key)
            
            if lnum not in diff_status_map:
                diff_status_map[lnum] = []
            diff_status_map[lnum].append(row['status'])
        
        # 6. 判断每个发货单的入库状态
        def calc_receive_status(logistic_num):
            """
            计算入库状态
            返回: (should_include, status)
            - should_include: 是否应该显示在列表中
            - status: 状态说明
            
            简化逻辑：只要有收货记录（总数>0）就排除
            """
            receive_data = receive_map.get(logistic_num, {})
            
            # 没有收货记录，可以入库
            if not receive_data:
                return (True, 'none')
            
            # 计算收货总数
            total_receive = sum(receive_data.values())
            
            # 有收货记录且总数>0，排除
            if total_receive > 0:
                return (False, 'received')
            
            # 收货总数为0，可以入库
            return (True, 'none')
        
        # 7. 组装结果（过滤掉已完成的）
        shipments = []
        for _idx, row in shipments_df.iterrows():
            lnum = row['sent_logistic_num']
            
            should_include, status = calc_receive_status(lnum)
            if not should_include:
                continue  # 排除已完成入库的发货单
            
            info = send_info_map.get(lnum, {'date_eta': None, 'pallets': 0})
            
            shipments.append({
                'logistic_num': lnum,
                'sent_date': str(row['sent_date']),
                'date_eta': info['date_eta'],
                'pallets': info['pallets'],
                'sent_seq': row['sent_seq'],
                'receive_status': status
            })
        
        return JsonResponse({
            'success': True,
            'shipments': shipments
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({'success': False, 'message': _('查询失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_shipment_items_api(request):
    """
    获取发货单货物明细
    Permission: module.purchase.receive
    
    GET参数:
        logistic_num: 物流单号
    
    返回:
        {
            success: true,
            items: [
                {
                    po_num: 订单号,
                    po_sku: SKU,
                    sent_quantity: 发货数量（同订单+SKU合并）
                },
                ...
            ]
        }
    
    逻辑:
        从 in_send_final 中按 (po_num, po_sku) 合并 sent_quantity
        不同订单的相同 SKU 保持分开
    """
    if not check_perm(request.user, 'module.purchase.receive'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '')
    if not logistic_num:
        return JsonResponse({'success': False, 'message': _('缺少物流单号参数')}, status=400)
    
    try:
        # 按 (po_num, po_sku) 合并 sent_quantity
        items_df = DBClient.read_df("""
            SELECT 
                po_num,
                po_sku,
                SUM(sent_quantity) as sent_quantity
            FROM in_send_final
            WHERE sent_logistic_num = :logistic_num
            GROUP BY po_num, po_sku
            ORDER BY po_num, po_sku
        """, {'logistic_num': logistic_num})
        
        items = []
        if not items_df.empty:
            for _idx, row in items_df.iterrows():
                items.append({
                    'po_num': row['po_num'],
                    'po_sku': row['po_sku'],
                    'sent_quantity': int(row['sent_quantity'])
                })
        
        return JsonResponse({
            'success': True,
            'items': items
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({'success': False, 'message': _('查询失败: {error}').format(error=str(e))}, status=500)

