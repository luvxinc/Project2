"""
订单管理 - 订单列表查询
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET

from ..hub import check_perm
from core.components.db.client import DBClient
from backend.common.settings import settings
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_GET
def po_list_api(request):
    """
    获取采购订单列表
    URL: /dashboard/purchase/api/po_mgmt/list/
    Query Params:
      - supplier_code: 供应商代码筛选 (可选)
      - sort_by: 排序字段 (po_num/supplier_code/order_date)
      - sort_order: 排序方向 (asc/desc)
    Permission: module.purchase.po.mgmt
    
    删除判定逻辑:
    1. 直接删除: action='delete' AND po_sku=''(空) → 整单删除
    2. 计算删除: 按seq顺序应用所有变更后，若商品列表为空 → 订单删除
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        supplier_code_filter = request.GET.get('supplier_code', '').strip()
        sort_by = request.GET.get('sort_by', 'order_date')
        sort_order = request.GET.get('sort_order', 'desc')
        
        # 验证排序参数
        allowed_sort_fields = ['po_num', 'supplier_code', 'order_date']
        if sort_by not in allowed_sort_fields:
            sort_by = 'order_date'
        if sort_order not in ['asc', 'desc']:
            sort_order = 'desc'
        
        # Step 1: 获取所有唯一订单的基础信息
        base_sql = """
        SELECT DISTINCT 
            po_num,
            supplier_code,
            (SELECT update_date FROM in_po p2 WHERE p2.po_num = in_po.po_num AND action = 'new' AND seq = 'L01' LIMIT 1) as order_date,
            (SELECT MAX(update_date) FROM in_po p3 WHERE p3.po_num = in_po.po_num) as latest_detail_date,
            (SELECT seq FROM in_po p4 WHERE p4.po_num = in_po.po_num ORDER BY update_date DESC, seq DESC LIMIT 1) as latest_detail_seq
        FROM in_po
        WHERE 1=1
        """
        
        params = {}
        if supplier_code_filter:
            base_sql += " AND supplier_code = :supplier_code"
            params['supplier_code'] = supplier_code_filter
        
        base_df = DBClient.read_df(base_sql, params)
        
        if base_df.empty:
            return JsonResponse({'success': True, 'data': [], 'count': 0})
        
        # Step 2: 获取策略信息（包含货币和汇率）
        strategy_sql = """
        SELECT 
            po_num,
            MAX(date) as latest_strategy_date,
            (SELECT seq FROM in_po_strategy s2 
             WHERE s2.po_num = in_po_strategy.po_num 
             ORDER BY date DESC, seq DESC LIMIT 1) as latest_strategy_seq,
            (SELECT cur_currency FROM in_po_strategy s3 
             WHERE s3.po_num = in_po_strategy.po_num 
             ORDER BY date DESC, seq DESC LIMIT 1) as currency,
            (SELECT cur_usd_rmb FROM in_po_strategy s4 
             WHERE s4.po_num = in_po_strategy.po_num 
             ORDER BY date DESC, seq DESC LIMIT 1) as usd_rmb
        FROM in_po_strategy
        GROUP BY po_num
        """
        strategy_df = DBClient.read_df(strategy_sql)
        strategy_map = {}
        for _idx, row in strategy_df.iterrows():
            strategy_map[row['po_num']] = {
                'date': str(row['latest_strategy_date']) if row['latest_strategy_date'] else '-',
                'seq': row.get('latest_strategy_seq') or 'V01',
                'currency': row.get('currency') or 'RMB',
                'usd_rmb': float(row['usd_rmb']) if row.get('usd_rmb') else 7.0
            }
        
        # Step 3: 获取所有订单的明细数据用于删除判定
        all_po_nums = base_df['po_num'].tolist()
        all_details_sql = """
        SELECT po_num, po_sku, po_quantity, po_price, action, seq, note
        FROM in_po
        WHERE po_num IN :po_nums
        ORDER BY po_num, seq
        """
        all_details_df = DBClient.read_df(all_details_sql, {'po_nums': tuple(all_po_nums)})
        
        # 按po_num分组
        details_by_po = {}
        for _idx, row in all_details_df.iterrows():
            po_num = row['po_num']
            if po_num not in details_by_po:
                details_by_po[po_num] = []
            details_by_po[po_num].append({
                'sku': row['po_sku'] or '',
                'qty': int(row['po_quantity']) if row['po_quantity'] else 0,
                'unit_price': float(row['po_price']) if row['po_price'] else 0,
                'action': row['action'] or '',
                'seq': row['seq'] or '',
                'note': row.get('note', '') or ''
            })
        
        # Step 4: 对每个订单计算删除状态和最终商品列表
        def check_order_deleted(po_num, details):
            """
            判断订单是否已删除，并返回最终商品列表
            新逻辑：当遇到action='delete' AND po_sku=''时，清空之前所有数据，
            后续的add/adjust记录可以重新累积数据（用于恢复订单）
            返回: (is_deleted, delete_reason, items)
            """
            # 按seq排序所有记录
            def seq_key(x):
                try:
                    return int(x['seq'].replace('L', ''))
                except:
                    return 999
            sorted_details = sorted(details, key=seq_key)
            
            # 初始化商品列表
            items = {}
            
            for d in sorted_details:
                action = d['action']
                sku = d['sku'] or ''
                seq = d['seq']
                
                if action == 'new' and seq == 'L01' and sku:
                    # 初始数据 - 使用 (sku, price) 作为 key 避免同SKU不同价格被覆盖
                    key = (sku, d['unit_price'])
                    items[key] = {'qty': d['qty'], 'unit_price': d['unit_price']}
                
                elif action == 'adjust' and not sku:
                    # 整单删除标记：note以"删除订单"开头，清空之前所有数据
                    if d.get('note', '').startswith('删除订单'):
                        items = {}
                
                elif action == 'adjust' and sku:
                    # 调整：更新已存在SKU
                    # 如果qty=0，表示删除（统一的单项删除模式）
                    key = (sku, d['unit_price'])
                    if d['qty'] == 0:
                        if key in items:
                            del items[key]
                    elif key in items:
                        items[key] = {'qty': d['qty'], 'unit_price': d['unit_price']}
                
                elif action == 'add' and sku:
                    # 新增：添加新SKU（用于恢复或新增商品）
                    key = (sku, d['unit_price'])
                    items[key] = {'qty': d['qty'], 'unit_price': d['unit_price']}
            
            # 如果最终商品列表为空，视为删除
            if not items:
                return True, 'no_items', items
            
            return False, None, items
        
        # Step 4.5: 检查订单是否有账单文件
        def check_invoice_file(po_num, supplier_code):
            """检查是否存在账单文件，返回最新版本文件名"""
            # 从 po_num 解析年份（格式：XX20260104S01 -> 2026）
            year = '20' + po_num[2:4] if len(po_num) >= 4 else '2026'
            
            # 新路径：data/records/purchase/po/{YYYY}/{supplier}/
            invoices_dir = settings.DATA_DIR / 'records' / 'purchase' / 'po' / year / supplier_code
            if not invoices_dir.exists():
                return None
            
            # 查找匹配的文件（兼容 _V## 和 _Ver## 格式）
            matching_files = list(invoices_dir.glob(f"{po_num}_invoice_V*"))
            if not matching_files:
                return None
            
            # 获取最大版本号
            max_ver = 0
            latest_file = None
            for f in matching_files:
                try:
                    ver_str = f.stem.split('_V')[-1]
                    ver_num = int(ver_str)
                    if ver_num > max_ver:
                        max_ver = ver_num
                        latest_file = f.name
                except:
                    pass
            
            return latest_file
        
        # Step 4.6: 计算发货状态
        # 获取所有订单号对应的in_po_final数据
        po_final_sql = """
        SELECT po_num, po_sku, po_quantity, po_price
        FROM in_po_final
        WHERE po_num IN :po_nums
        """
        po_final_df = DBClient.read_df(po_final_sql, {'po_nums': tuple(all_po_nums)})
        
        # 获取所有订单号对应的in_send_final数据（按sku和price聚合sent_quantity）
        send_final_sql = """
        SELECT po_num, po_sku, po_price, SUM(sent_quantity) as total_sent
        FROM in_send_final
        WHERE po_num IN :po_nums
        GROUP BY po_num, po_sku, po_price
        """
        send_final_df = DBClient.read_df(send_final_sql, {'po_nums': tuple(all_po_nums)})
        
        # 将send_final数据转换为字典 {(po_num, po_sku, po_price): total_sent}
        send_map = {}
        if not send_final_df.empty:
            for _idx, row in send_final_df.iterrows():
                key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
                send_map[key] = int(row['total_sent']) if row['total_sent'] else 0
        
        def calculate_shipping_status(po_num):
            """
            计算订单发货状态
            返回: 'fully_shipped' | 'not_shipped' | 'partially_shipped'
            """
            # 从po_final_df筛选当前订单的数据
            po_items = po_final_df[po_final_df['po_num'] == po_num]
            
            if po_items.empty:
                return 'not_shipped'  # 没有订单数据，视为未发货
            
            total_ordered = 0  # 总订货量
            total_diff = 0     # 差值总和 (订货量 - 已发量)
            
            for _idx, item in po_items.iterrows():
                sku = item['po_sku']
                qty = int(item['po_quantity']) if item['po_quantity'] else 0
                price = float(item['po_price']) if item['po_price'] else 0
                
                total_ordered += qty
                
                # 查找对应的发货量
                key = (po_num, sku, price)
                sent_qty = send_map.get(key, 0)
                
                diff = qty - sent_qty
                total_diff += diff
            
            if total_ordered == 0:
                return 'not_shipped'
            elif total_diff == 0:
                return 'fully_shipped'  # 全部已发货
            elif total_diff == total_ordered:
                return 'not_shipped'    # 在产未发货
            else:
                return 'partially_shipped'  # 部分已发货
        
        # Step 5: 构建返回数据
        orders = []
        for _idx, row in base_df.iterrows():
            po_num = row['po_num']
            supplier_code = row['supplier_code']
            details = details_by_po.get(po_num, [])
            is_deleted, delete_reason, items = check_order_deleted(po_num, details)
            
            # 计算总额（原始货币）
            total_amount = sum(item['qty'] * item['unit_price'] for item in items.values())
            
            # 获取货币和汇率信息
            strategy_info = strategy_map.get(po_num, {'date': '-', 'seq': 'V01', 'currency': 'RMB', 'usd_rmb': 7.0})
            currency = strategy_info.get('currency', 'RMB')
            usd_rmb = strategy_info.get('usd_rmb', 7.0)
            
            # 计算双货币金额
            # 货物金额按原始货币计算，然后互相转换
            if currency == 'USD':
                # 原始货币是USD，转换为RMB
                total_usd = round(total_amount, 5)
                total_rmb = round(total_amount * usd_rmb, 5)
            else:
                # 原始货币是RMB，转换为USD
                total_rmb = round(total_amount, 5)
                total_usd = round(total_amount / usd_rmb, 5) if usd_rmb > 0 else 0
            
            # 检查账单文件
            invoice_file = check_invoice_file(po_num, supplier_code)
            
            # 计算发货状态
            shipping_status = calculate_shipping_status(po_num) if not is_deleted else 'not_shipped'
            
            orders.append({
                'po_num': po_num,
                'supplier_code': supplier_code,
                'order_date': str(row['order_date']) if row['order_date'] else '-',
                'latest_strategy_date': strategy_info['date'],
                'latest_strategy_seq': strategy_info['seq'],
                'latest_detail_date': str(row['latest_detail_date']) if row['latest_detail_date'] else '-',
                'latest_detail_seq': row.get('latest_detail_seq') or 'L01',
                'total_amount': round(total_amount, 5),  # 兼容性保留
                'total_rmb': total_rmb,
                'total_usd': total_usd,
                'currency': currency,
                'usd_rmb': usd_rmb,
                'has_invoice': invoice_file is not None,
                'invoice_file': invoice_file,
                'is_deleted': is_deleted,
                'delete_reason': delete_reason,
                'shipping_status': shipping_status
            })
        
        # Step 6: 排序
        sort_key_map = {
            'po_num': lambda x: x['po_num'],
            'supplier_code': lambda x: x['supplier_code'],
            'order_date': lambda x: x['order_date']
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
            'message': _('获取订单列表失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def supplier_list_for_filter_api(request):
    """
    获取供应商列表（用于筛选下拉）
    URL: /dashboard/purchase/api/po_mgmt/suppliers/
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        df = DBClient.read_df("""
            SELECT DISTINCT supplier_code 
            FROM in_supplier 
            ORDER BY supplier_code
        """)
        
        suppliers = df['supplier_code'].tolist() if not df.empty else []
        
        return JsonResponse({
            'success': True,
            'data': suppliers
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': _('获取供应商列表失败: {error}').format(error=str(e))
        }, status=500)
