"""
发货单管理 - 货物明细修改API - 查询接口

[P0-1 拆分] 从 edit_items.py 提取的查询API
"""
import json
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET

from ...hub import check_perm
from core.components.db.client import DBClient
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_GET
def get_items_for_edit_api(request):
    """
    获取发货单货物明细列表（用于修改向导Step3）
    URL: /dashboard/purchase/api/send_mgmt/items_for_edit/?logistic_num=xxx
    
    返回货物列表，列包含:
    - 订单日期, SKU, 单价, 订货量, 已发量, 发货量, 未发量, 是否规整订单
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '').strip()
    if not logistic_num:
        return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
    
    try:
        # 1. 获取in_send表中的seq（版本号）
        seq_df = DBClient.read_df("""
            SELECT seq, CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
            FROM in_send
            WHERE logistic_num = :logistic_num
            ORDER BY seq_num DESC
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        current_seq = seq_df.iloc[0]['seq'] if not seq_df.empty else 'S01'
        
        # 2. 获取当前发货单的货物列表（in_send_final）
        items_df = DBClient.read_df("""
            SELECT 
                po_num,
                po_sku,
                sent_quantity,
                po_price
            FROM in_send_final
            WHERE sent_logistic_num = :logistic_num
            ORDER BY po_num, po_sku
        """, {'logistic_num': logistic_num})
        
        if items_df.empty:
            return JsonResponse({
                'success': True,
                'data': {
                    'current_seq': current_seq,
                    'items': []
                }
            })
        
        # 3. 获取所有相关订单的日期和货币信息
        po_nums = items_df['po_num'].unique().tolist()
        po_date_map = {}
        po_currency_map = {}  # 新增：订单货币映射
        if po_nums:
            date_df = DBClient.read_df("""
                SELECT po_num, po_date
                FROM in_po_final
                WHERE po_num IN :po_nums
                GROUP BY po_num, po_date
            """, {'po_nums': tuple(po_nums)})
            
            if not date_df.empty:
                for _idx, row in date_df.iterrows():
                    po_date_map[row['po_num']] = str(row['po_date']) if row['po_date'] else ''
            
            # 获取订单货币信息（从最新的策略记录中）
            currency_df = DBClient.read_df("""
                SELECT s.po_num, s.cur_currency
                FROM in_po_strategy s
                INNER JOIN (
                    SELECT po_num, MAX(CONCAT(date, seq)) as max_key
                    FROM in_po_strategy
                    WHERE po_num IN :po_nums
                    GROUP BY po_num
                ) latest ON s.po_num = latest.po_num 
                    AND CONCAT(s.date, s.seq) = latest.max_key
            """, {'po_nums': tuple(po_nums)})
            
            if not currency_df.empty:
                for _idx, row in currency_df.iterrows():
                    po_currency_map[row['po_num']] = row['cur_currency'] or 'RMB'
        
        # 4. 获取所有SKU的订货量和已发量
        all_skus = items_df['po_sku'].unique().tolist()
        
        # 订货量（以po_num, po_sku, po_price为key）
        ordered_map = {}
        if po_nums:
            ordered_df = DBClient.read_df("""
                SELECT po_num, po_sku, po_price, po_quantity
                FROM in_po_final
                WHERE po_num IN :po_nums
            """, {'po_nums': tuple(po_nums)})
            
            if not ordered_df.empty:
                for _idx, row in ordered_df.iterrows():
                    key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
                    ordered_map[key] = int(row['po_quantity']) if row['po_quantity'] else 0
        
        # 已发量（全局）
        sent_map = {}
        if po_nums:
            sent_df = DBClient.read_df("""
                SELECT po_num, po_sku, po_price, SUM(sent_quantity) as total_sent
                FROM in_send_final
                WHERE po_num IN :po_nums
                GROUP BY po_num, po_sku, po_price
            """, {'po_nums': tuple(po_nums)})
            
            if not sent_df.empty:
                for _idx, row in sent_df.iterrows():
                    key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
                    sent_map[key] = int(row['total_sent']) if row['total_sent'] else 0
        
        # 5. 检查是否规整订货量
        def check_is_adjusted(po_num, po_sku, po_price):
            """检查是否存在规整操作记录"""
            note_pattern = f'规整订单_物流单据规整操作_{logistic_num}'
            adjust_df = DBClient.read_df("""
                SELECT COUNT(*) as cnt
                FROM in_po_final
                WHERE po_num = :po_num 
                  AND po_sku = :po_sku 
                  AND ABS(po_price - :po_price) < 0.001
                  AND po_note LIKE :note_pattern
            """, {
                'po_num': po_num,
                'po_sku': po_sku,
                'po_price': po_price,
                'note_pattern': f'%{note_pattern}%'
            })
            
            if not adjust_df.empty and adjust_df.iloc[0]['cnt'] > 0:
                return True
            return False
        
        # 6. 构建返回数据
        items = []
        for idx, row in items_df.iterrows():
            po_num = row['po_num']
            po_sku = row['po_sku']
            po_price = float(row['po_price']) if row['po_price'] else 0
            sent_qty = int(row['sent_quantity']) if row['sent_quantity'] else 0
            
            key = (po_num, po_sku, po_price)
            ordered_qty = ordered_map.get(key, 0)
            total_sent = sent_map.get(key, 0)
            
            # 已发量（不含当前发货）
            already_sent = total_sent - sent_qty
            # 未发量
            unshipped_qty = ordered_qty - total_sent
            
            is_adjusted = check_is_adjusted(po_num, po_sku, po_price)
            
            items.append({
                'row_id': idx,  # 用于前端标识
                'po_num': po_num,
                'po_date': po_date_map.get(po_num, ''),
                'po_sku': po_sku,
                'po_price': po_price,
                'currency': po_currency_map.get(po_num, 'RMB'),  # 新增：货币
                'ordered_qty': ordered_qty,
                'already_sent': already_sent,
                'sent_qty': sent_qty,
                'unshipped_qty': unshipped_qty,
                'is_adjusted': is_adjusted,
                'is_deleted': False
            })
        
        return JsonResponse({
            'success': True,
            'data': {
                'current_seq': current_seq,
                'items': items
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取货物明细失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_available_po_list_api(request):
    """
    获取可用于新增发货的订单列表
    URL: /dashboard/purchase/api/send_mgmt/available_po_list/
    
    筛选逻辑：
    1. 获取in_po_final中所有unique的订单号
    2. 计算每个订单的差值（订货量 - 已发量）
    3. 排除差值总和为0的订单
    4. 支持动态排除（通过excluded_records参数传入需要排除的记录）
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        # 从查询参数获取需要排除的记录（JSON格式）
        excluded_json = request.GET.get('excluded_records', '[]')
        try:
            excluded_records = json.loads(excluded_json)
        except:
            excluded_records = []
        
        # 构建排除记录的key set
        excluded_keys = set()
        for rec in excluded_records:
            if rec.get('unshipped_qty', 1) == 0 or rec.get('is_adjusted', False):
                key = (rec.get('po_num'), rec.get('po_sku'), float(rec.get('po_price', 0)))
                excluded_keys.add(key)
        
        # 获取所有订单
        po_df = DBClient.read_df("""
            SELECT po_num, po_sku, po_price, po_quantity, po_date
            FROM in_po_final
            ORDER BY po_num
        """)
        
        if po_df.empty:
            return JsonResponse({'success': True, 'data': []})
        
        # 获取已发量
        send_df = DBClient.read_df("""
            SELECT po_num, po_sku, po_price, SUM(sent_quantity) as total_sent
            FROM in_send_final
            GROUP BY po_num, po_sku, po_price
        """)
        
        send_map = {}
        if not send_df.empty:
            for _idx, row in send_df.iterrows():
                key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
                send_map[key] = int(row['total_sent']) if row['total_sent'] else 0
        
        # 计算每个订单的差值总和
        po_diff_map = {}
        po_date_map = {}
        
        for _idx, item in po_df.iterrows():
            po_num = item['po_num']
            sku = item['po_sku']
            qty = int(item['po_quantity']) if item['po_quantity'] else 0
            price = float(item['po_price']) if item['po_price'] else 0
            
            key = (po_num, sku, price)
            sent_qty = send_map.get(key, 0)
            
            # 如果在排除列表中，差值视为0
            if key in excluded_keys:
                diff = 0
            else:
                diff = qty - sent_qty
            
            if po_num not in po_diff_map:
                po_diff_map[po_num] = 0
                po_date_map[po_num] = str(item['po_date']) if item['po_date'] else ''
            po_diff_map[po_num] += diff
        
        # 过滤掉差值为0的订单
        po_nums_to_query = [po_num for po_num, diff in po_diff_map.items() if diff > 0]
        
        # 获取订单货币信息
        po_currency_map = {}
        if po_nums_to_query:
            currency_df = DBClient.read_df("""
                SELECT s.po_num, s.cur_currency
                FROM in_po_strategy s
                INNER JOIN (
                    SELECT po_num, MAX(CONCAT(date, seq)) as max_key
                    FROM in_po_strategy
                    WHERE po_num IN :po_nums
                    GROUP BY po_num
                ) latest ON s.po_num = latest.po_num 
                    AND CONCAT(s.date, s.seq) = latest.max_key
            """, {'po_nums': tuple(po_nums_to_query)})
            
            if not currency_df.empty:
                for _idx, row in currency_df.iterrows():
                    po_currency_map[row['po_num']] = row['cur_currency'] or 'RMB'
        
        available_pos = []
        for po_num, diff in po_diff_map.items():
            if diff > 0:
                available_pos.append({
                    'po_num': po_num,
                    'po_date': po_date_map.get(po_num, ''),
                    'remaining': diff,
                    'currency': po_currency_map.get(po_num, 'RMB')
                })
        
        # 按订单号排序
        available_pos.sort(key=lambda x: x['po_num'])
        
        return JsonResponse({
            'success': True,
            'data': available_pos
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取订单列表失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_available_sku_list_api(request):
    """
    获取指定订单号下可用的SKU列表
    URL: /dashboard/purchase/api/send_mgmt/available_sku_list/?po_num=xxx
    
    筛选逻辑：
    1. 获取指定订单号在in_po_final中的所有SKU
    2. 排除差值为0的SKU
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    po_num = request.GET.get('po_num', '').strip()
    if not po_num:
        return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
    
    try:
        # 从查询参数获取需要排除的记录
        excluded_json = request.GET.get('excluded_records', '[]')
        try:
            excluded_records = json.loads(excluded_json)
        except:
            excluded_records = []
        
        excluded_keys = set()
        for rec in excluded_records:
            if rec.get('unshipped_qty', 1) == 0 or rec.get('is_adjusted', False):
                key = (rec.get('po_num'), rec.get('po_sku'), float(rec.get('po_price', 0)))
                excluded_keys.add(key)
        
        # 获取该订单的所有SKU
        po_df = DBClient.read_df("""
            SELECT po_sku, po_price, po_quantity
            FROM in_po_final
            WHERE po_num = :po_num
        """, {'po_num': po_num})
        
        if po_df.empty:
            return JsonResponse({'success': True, 'data': []})
        
        # 获取已发量
        send_df = DBClient.read_df("""
            SELECT po_sku, po_price, SUM(sent_quantity) as total_sent
            FROM in_send_final
            WHERE po_num = :po_num
            GROUP BY po_sku, po_price
        """, {'po_num': po_num})
        
        send_map = {}
        if not send_df.empty:
            for _idx, row in send_df.iterrows():
                key = (row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
                send_map[key] = int(row['total_sent']) if row['total_sent'] else 0
        
        # 计算每个SKU的差值，排除差值为0的
        sku_diff_map = {}  # {sku: total_diff}
        
        for _idx, item in po_df.iterrows():
            sku = item['po_sku']
            qty = int(item['po_quantity']) if item['po_quantity'] else 0
            price = float(item['po_price']) if item['po_price'] else 0
            
            full_key = (po_num, sku, price)
            key = (sku, price)
            sent_qty = send_map.get(key, 0)
            
            if full_key in excluded_keys:
                diff = 0
            else:
                diff = qty - sent_qty
            
            if sku not in sku_diff_map:
                sku_diff_map[sku] = 0
            sku_diff_map[sku] += diff
        
        # 过滤掉差值为0的SKU
        available_skus = [sku for sku, diff in sku_diff_map.items() if diff > 0]
        available_skus.sort()
        
        return JsonResponse({
            'success': True,
            'data': available_skus
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取SKU列表失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_available_price_list_api(request):
    """
    获取指定订单号和SKU下可用的价格列表
    URL: /dashboard/purchase/api/send_mgmt/available_price_list/?po_num=xxx&po_sku=xxx
    
    若只有一个价格，也返回；若有多个，返回未发货完的价格列表
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    po_num = request.GET.get('po_num', '').strip()
    po_sku = request.GET.get('po_sku', '').strip()
    
    if not po_num or not po_sku:
        return JsonResponse({'success': False, 'message': _('缺少订单号或SKU')}, status=400)
    
    try:
        # 从查询参数获取需要排除的记录
        excluded_json = request.GET.get('excluded_records', '[]')
        try:
            excluded_records = json.loads(excluded_json)
        except:
            excluded_records = []
        
        excluded_keys = set()
        for rec in excluded_records:
            if rec.get('unshipped_qty', 1) == 0 or rec.get('is_adjusted', False):
                key = (rec.get('po_num'), rec.get('po_sku'), float(rec.get('po_price', 0)))
                excluded_keys.add(key)
        
        # 获取该订单该SKU的所有价格
        po_df = DBClient.read_df("""
            SELECT po_price, po_quantity
            FROM in_po_final
            WHERE po_num = :po_num AND po_sku = :po_sku
        """, {'po_num': po_num, 'po_sku': po_sku})
        
        if po_df.empty:
            return JsonResponse({'success': True, 'data': {'prices': [], 'is_single': False}})
        
        # 获取已发量
        send_df = DBClient.read_df("""
            SELECT po_price, SUM(sent_quantity) as total_sent
            FROM in_send_final
            WHERE po_num = :po_num AND po_sku = :po_sku
            GROUP BY po_price
        """, {'po_num': po_num, 'po_sku': po_sku})
        
        send_map = {}
        if not send_df.empty:
            for _idx, row in send_df.iterrows():
                price = float(row['po_price']) if row['po_price'] else 0
                send_map[price] = int(row['total_sent']) if row['total_sent'] else 0
        
        # 计算每个价格的差值
        available_prices = []
        for _idx, item in po_df.iterrows():
            price = float(item['po_price']) if item['po_price'] else 0
            qty = int(item['po_quantity']) if item['po_quantity'] else 0
            sent_qty = send_map.get(price, 0)
            
            full_key = (po_num, po_sku, price)
            if full_key in excluded_keys:
                diff = 0
            else:
                diff = qty - sent_qty
            
            if diff > 0:
                available_prices.append({
                    'price': price,
                    'ordered_qty': qty,
                    'sent_qty': sent_qty,
                    'remaining': diff
                })
        
        # 若只有一个价格
        is_single = len(available_prices) == 1
        
        return JsonResponse({
            'success': True,
            'data': {
                'prices': available_prices,
                'is_single': is_single,
                'single_price': available_prices[0] if is_single else None
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取价格列表失败: {error}').format(error=str(e))
        }, status=500)
