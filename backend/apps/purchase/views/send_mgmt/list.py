"""
发货单管理 - 发货单列表查询
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from pathlib import Path

from ..hub import check_perm
from core.components.db.client import DBClient
from backend.common.settings import settings

from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_GET
def po_list_api(request):
    """
    获取发货单列表
    URL: /dashboard/purchase/api/send_mgmt/list/
    Query Params:
      - sort_by: 排序字段 (logistic_num/date_sent)
      - sort_order: 排序方向 (asc/desc)
    Permission: module.purchase.send.mgmt
    
    列表显示字段:
    - 物流单号: in_send.logistic_num (DISTINCT)
    - 发货日期: in_send.date_sent (对应logistic_num)
    - 预计到达: in_send.date_eta (max seq)
    - 托盘数: in_send.pallets (max seq)
    - 物流参数版本: in_send.seq (max)
    - 货物明细版本: in_send_list.seq (max)
    - 物流费用: in_send.total_price (max seq)
    - 货物价值: SUM(po_price * sent_quantity) from in_send_final
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        sort_by = request.GET.get('sort_by', 'date_sent')
        sort_order = request.GET.get('sort_order', 'desc')
        
        # 验证排序参数
        allowed_sort_fields = ['logistic_num', 'date_sent']
        if sort_by not in allowed_sort_fields:
            sort_by = 'date_sent'
        if sort_order not in ['asc', 'desc']:
            sort_order = 'desc'
        
        # Step 1: 获取所有唯一物流单号
        logistic_nums_sql = """
        SELECT DISTINCT logistic_num FROM in_send
        """
        logistic_df = DBClient.read_df(logistic_nums_sql)
        
        if logistic_df.empty:
            return JsonResponse({'success': True, 'data': [], 'count': 0})
        
        logistic_nums = logistic_df['logistic_num'].tolist()
        
        # Step 2: 获取每个物流单号的最大seq及其相关信息
        # seq格式为L##，需要提取数字进行比较
        send_info_sql = """
        SELECT 
            logistic_num,
            date_sent,
            date_eta,
            pallets,
            total_price,
            usd_rmb,
            seq,
            date_record,
            CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
        FROM in_send
        WHERE logistic_num IN :logistic_nums
        ORDER BY logistic_num, seq_num DESC
        """
        send_df = DBClient.read_df(send_info_sql, {'logistic_nums': tuple(logistic_nums)})
        
        # 按logistic_num分组，取seq_num最大的记录
        send_info_map = {}
        for _idx, row in send_df.iterrows():
            logistic_num = row['logistic_num']
            if logistic_num not in send_info_map:
                # 第一条即为seq_num最大的
                send_info_map[logistic_num] = {
                    'date_sent': str(row['date_sent']) if row['date_sent'] else '-',
                    'date_eta': str(row['date_eta']) if row['date_eta'] else '-',
                    'pallets': int(row['pallets']) if row['pallets'] else 0,
                    'total_price': float(row['total_price']) if row['total_price'] else 0.0,
                    'usd_rmb': float(row['usd_rmb']) if row.get('usd_rmb') else 7.0,
                    'logistics_param_seq': row['seq'] or 'L01',
                    'param_record_date': str(row['date_record']) if row['date_record'] else '-'
                }
        
        # Step 3: 获取货物明细版本 (in_send_list中的最大seq)
        send_list_sql = """
        SELECT 
            logistic_num,
            seq,
            date,
            CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
        FROM in_send_list
        WHERE logistic_num IN :logistic_nums
        ORDER BY logistic_num, seq_num DESC
        """
        send_list_df = DBClient.read_df(send_list_sql, {'logistic_nums': tuple(logistic_nums)})
        
        # 按logistic_num分组，取seq_num最大的记录
        detail_version_map = {}
        for _idx, row in send_list_df.iterrows():
            logistic_num = row['logistic_num']
            if logistic_num not in detail_version_map:
                detail_version_map[logistic_num] = {
                    'seq': row['seq'] or 'L01',
                    'date': str(row['date']) if row['date'] else '-'
                }
        
        # Step 4: 计算货物价值 (需要按订单获取货币和汇率进行双货币换算)
        # 先获取每个物流单的明细
        cargo_detail_sql = """
        SELECT 
            sf.sent_logistic_num as logistic_num,
            sf.po_num,
            sf.po_sku,
            sf.po_price,
            sf.sent_quantity
        FROM in_send_final sf
        WHERE sf.sent_logistic_num IN :logistic_nums
        """
        cargo_detail_df = DBClient.read_df(cargo_detail_sql, {'logistic_nums': tuple(logistic_nums)})
        
        # 获取涉及的所有订单号的货币策略
        po_currency_map = {}
        if not cargo_detail_df.empty:
            po_nums = list(cargo_detail_df['po_num'].unique())
            if po_nums:
                strategy_sql = """
                SELECT 
                    po_num,
                    (SELECT cur_currency FROM in_po_strategy s2 
                     WHERE s2.po_num = in_po_strategy.po_num 
                     ORDER BY date DESC, seq DESC LIMIT 1) as currency,
                    (SELECT cur_usd_rmb FROM in_po_strategy s3 
                     WHERE s3.po_num = in_po_strategy.po_num 
                     ORDER BY date DESC, seq DESC LIMIT 1) as usd_rmb
                FROM in_po_strategy
                WHERE po_num IN :po_nums
                GROUP BY po_num
                """
                strategy_df = DBClient.read_df(strategy_sql, {'po_nums': tuple(po_nums)})
                for _idx, srow in strategy_df.iterrows():
                    po_currency_map[srow['po_num']] = {
                        'currency': srow.get('currency') or 'RMB',
                        'usd_rmb': float(srow['usd_rmb']) if srow.get('usd_rmb') else 7.0
                    }
        
        # 按物流单号计算双货币货物价值
        cargo_value_map = {}
        for logistic_num in logistic_nums:
            cargo_value_map[logistic_num] = {'rmb': 0.0, 'usd': 0.0, 'total': 0.0}
        
        for _idx, row in cargo_detail_df.iterrows():
            logistic_num = row['logistic_num']
            po_num = row['po_num']
            unit_price = float(row['po_price']) if row['po_price'] else 0.0
            quantity = int(row['sent_quantity']) if row['sent_quantity'] else 0
            item_value = unit_price * quantity
            
            # 获取订单货币策略
            po_strat = po_currency_map.get(po_num, {'currency': 'RMB', 'usd_rmb': 7.0})
            currency = po_strat['currency']
            po_usd_rmb = po_strat['usd_rmb']
            
            # 计算双货币
            if currency == 'USD':
                value_usd = item_value
                value_rmb = item_value * po_usd_rmb
            else:
                value_rmb = item_value
                value_usd = item_value / po_usd_rmb if po_usd_rmb > 0 else 0
            
            cargo_value_map[logistic_num]['rmb'] += value_rmb
            cargo_value_map[logistic_num]['usd'] += value_usd
            cargo_value_map[logistic_num]['total'] += item_value
        
        # Step 5: 计算入库状态
        # 获取 in_receive_final 数据
        receive_final_df = DBClient.read_df("""
            SELECT 
                logistic_num,
                po_num,
                po_sku,
                po_price,
                sent_quantity,
                receive_quantity
            FROM in_receive_final
            WHERE logistic_num IN :logistic_nums
        """, {'logistic_nums': tuple(logistic_nums)})
        
        # 构建 receive 数据 map: { logistic_num: { (po_num, po_sku, po_price): receive_quantity } }
        receive_map = {}
        for _idx, row in receive_final_df.iterrows():
            logistic_num = row['logistic_num']
            if logistic_num not in receive_map:
                receive_map[logistic_num] = {}
            key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
            receive_map[logistic_num][key] = int(row['receive_quantity']) if row['receive_quantity'] else 0
        
        # 获取 in_diff_final 数据（终态表，直接反映异常处理结果）
        diff_final_df = DBClient.read_df("""
            SELECT 
                logistic_num,
                po_num,
                po_sku,
                diff_quantity
            FROM in_diff_final
            WHERE logistic_num IN :logistic_nums
        """, {'logistic_nums': tuple(logistic_nums)})
        
        # 构建 diff 状态 map: { logistic_num: [diff_quantities] }
        # 使用 diff_quantity 判断状态：diff_quantity != 0 表示未解决
        diff_qty_map = {}
        for _idx, row in diff_final_df.iterrows():
            logistic_num = row['logistic_num']
            if logistic_num not in diff_qty_map:
                diff_qty_map[logistic_num] = []
            diff_qty_map[logistic_num].append(int(row['diff_quantity']) if row['diff_quantity'] else 0)
        
        # 计算每个物流单的入库状态
        def calc_receive_status(logistic_num):
            """
            计算入库状态
            返回: (status_tag, can_modify, can_delete)
            """
            receive_data = receive_map.get(logistic_num, {})
            
            # 情况3: 收货数量为0，货物在途中
            if not receive_data:
                return (_('货物在途中'), True, True)
            
            # 检查是否所有行都匹配
            # 需要对比 in_send_final 和 in_receive_final
            cargo_rows = cargo_detail_df[cargo_detail_df['logistic_num'] == logistic_num]
            all_match = True
            has_receive = False
            
            for _idx, send_row in cargo_rows.iterrows():
                key = (send_row['po_num'], send_row['po_sku'], 
                       float(send_row['po_price']) if send_row['po_price'] else 0)
                sent_qty = int(send_row['sent_quantity']) if send_row['sent_quantity'] else 0
                receive_qty = receive_data.get(key, 0)
                
                if receive_qty > 0:
                    has_receive = True
                
                if sent_qty != receive_qty:
                    all_match = False
            
            # 情况3: 没有任何收货记录
            if not has_receive:
                return (_('货物在途中'), True, True)
            
            # 情况1: 全部已入库（所有行发货=入库）
            if all_match:
                return (_('全部已入库'), False, False)
            
            # 情况2: 入库有差异 - 使用 diff_quantity 判断
            diff_quantities = diff_qty_map.get(logistic_num, [])
            if not diff_quantities:
                return (_('入库有差异:未解决'), False, False)
            
            # 所有 diff_quantity 都为 0 表示已解决
            if all(dq == 0 for dq in diff_quantities):
                return (_('入库有差异:已解决'), False, False)
            else:
                return (_('入库有差异:未解决'), False, False)
        
        # Step 6: 构建返回数据
        orders = []
        for logistic_num in logistic_nums:
            info = send_info_map.get(logistic_num, {})
            detail_info = detail_version_map.get(logistic_num, {'seq': 'L01', 'date': '-'})
            
            # 检查账单文件
            invoice_file = check_invoice_file(logistic_num)
            
            # 判断是否已删除（in_send_final中无记录表示已删除）
            cargo_info = cargo_value_map.get(logistic_num, {'rmb': 0.0, 'usd': 0.0, 'total': 0.0})
            is_deleted = cargo_info['total'] == 0.0
            
            # 计算入库状态
            receive_status, can_modify, can_delete = calc_receive_status(logistic_num)
            
            # 物流费用双货币 (物流费用是RMB，用物流单汇率换算USD)
            logistics_cost_rmb = info.get('total_price', 0.0)
            send_usd_rmb = info.get('usd_rmb', 7.0)
            logistics_cost_usd = round(logistics_cost_rmb / send_usd_rmb, 5) if send_usd_rmb > 0 else 0
            
            orders.append({
                'logistic_num': logistic_num,
                'date_sent': info.get('date_sent', '-'),
                'date_eta': info.get('date_eta', '-'),
                'pallets': info.get('pallets', 0),
                'logistics_param_seq': info.get('logistics_param_seq', 'L01'),
                'param_record_date': info.get('param_record_date', '-'),
                'detail_version_seq': detail_info.get('seq', 'L01') if isinstance(detail_info, dict) else detail_info,
                'detail_record_date': detail_info.get('date', '-') if isinstance(detail_info, dict) else '-',
                'logistics_cost': logistics_cost_rmb,  # 兼容性保留
                'logistics_cost_rmb': round(logistics_cost_rmb, 5),
                'logistics_cost_usd': logistics_cost_usd,
                'cargo_value': cargo_info['total'],  # 兼容性保留
                'cargo_value_rmb': round(cargo_info['rmb'], 5),
                'cargo_value_usd': round(cargo_info['usd'], 5),
                'has_invoice': invoice_file is not None,
                'invoice_file': invoice_file,
                'is_deleted': is_deleted,
                'receive_status': receive_status,
                'can_modify': can_modify,
                'can_delete': can_delete,
            })
        
        # Step 6: 排序
        sort_key_map = {
            'logistic_num': lambda x: x['logistic_num'],
            'date_sent': lambda x: x['date_sent']
        }
        orders.sort(key=sort_key_map[sort_by], reverse=(sort_order == 'desc'))
        
        return JsonResponse({
            'success': True,
            'data': orders,
            'count': len(orders)
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取发货单列表失败: {error}').format(error=str(e))
        }, status=500)


def check_invoice_file(logistic_num):
    """检查是否存在账单文件，返回最新版本文件名
    文件路径: data/records/purchase/send/{YYYY}/{logistic_num}_invoice_V##
    """
    from datetime import datetime
    
    # 尝试当前年份和前一年
    years_to_check = [str(datetime.now().year), str(datetime.now().year - 1)]
    
    for year in years_to_check:
        invoices_dir = settings.DATA_DIR / 'records' / 'purchase' / 'send' / year
        if not invoices_dir.exists():
            continue
        
        # 查找匹配的文件（兼容 _V## 格式）
        matching_files = list(invoices_dir.glob(f"{logistic_num}_invoice_V*"))
        if matching_files:
            # 获取最大版本号
            max_ver = 0
            latest_file = None
            for f in matching_files:
                try:
                    # 提取版本号：{logistic_num}_invoice_V##.ext
                    stem = f.stem  # 不包含扩展名
                    ver_str = stem.split('_V')[-1]
                    ver_num = int(ver_str)
                    if ver_num > max_ver:
                        max_ver = ver_num
                        latest_file = f.name
                except:
                    pass
            
            if latest_file:
                return latest_file
    
    return None


@login_required(login_url='web_ui:login')
@require_GET
def supplier_list_for_filter_api(request):
    """
    获取物流单号列表（用于筛选下拉）—— 此API暂时保留但在发货单管理中不使用
    URL: /dashboard/purchase/api/send_mgmt/logistics/
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        df = DBClient.read_df("""
            SELECT DISTINCT logistic_num 
            FROM in_send 
            ORDER BY logistic_num
        """)
        
        logistics = df['logistic_num'].tolist() if not df.empty else []
        
        return JsonResponse({
            'success': True,
            'data': logistics
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': _('获取物流单号列表失败: {error}').format(error=str(e))
        }, status=500)
