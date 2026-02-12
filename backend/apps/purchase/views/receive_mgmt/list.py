"""
入库管理 - 列表查询API

[P0-2 Fix] 统一使用 hub.check_perm
[P1-2 Fix] 使用 logging 替代 traceback.print_exc
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


def check_has_receive_file(logistic_num: str, receive_date: str) -> bool:
    """检查是否有入库文件
    文件路径: data/records/purchase/receive/{YYYY}/{YYYYMMDD}_{logistic_num}_V##
    """
    if not receive_date or receive_date == '-':
        return False
    try:
        from datetime import datetime
        date_obj = datetime.strptime(str(receive_date)[:10], '%Y-%m-%d')
        year = date_obj.strftime('%Y')
        date_prefix = date_obj.strftime('%Y%m%d')
        
        # 新路径：data/records/purchase/receive/{YYYY}/
        receiving_dir = settings.DATA_DIR / 'records' / 'purchase' / 'receive' / year
        if not receiving_dir.exists():
            return False
        
        # 兼容新旧格式：_V## 和 _Ver##
        file_pattern = f"{date_prefix}_{logistic_num}_V*"
        matching_files = list(receiving_dir.glob(file_pattern))
        return len(matching_files) > 0
    except:
        return False


@login_required(login_url='web_ui:login')
@require_GET
def receive_list_api(request):
    """
    获取入库记录列表
    URL: /dashboard/purchase/api/receive_mgmt/list/
    Permission: module.purchase.receive.mgmt
    
    返回字段:
        - logistic_num: 物流单号
        - receive_date: 入库日期
        - receive_status: 入库状态 tag
        - detail_seq: 入库明细版号
        - update_date: 更新日期
        - can_modify: 是否可修改
        - can_delete: 是否可删除
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    try:
        sort_by = request.GET.get('sort_by', 'receive_date')
        sort_order = request.GET.get('sort_order', 'desc')
        
        # 验证排序参数
        allowed_sort_fields = ['logistic_num', 'receive_date']
        if sort_by not in allowed_sort_fields:
            sort_by = 'receive_date'
        if sort_order not in ['asc', 'desc']:
            sort_order = 'desc'
        
        # 1. 从 in_receive 获取所有唯一物流单号（包括已删除的）
        receive_df = DBClient.read_df("""
            SELECT DISTINCT 
                logistic_num,
                (SELECT receive_date FROM in_receive r2 
                 WHERE r2.logistic_num = in_receive.logistic_num 
                 ORDER BY CAST(REGEXP_REPLACE(seq, '[^0-9]', '') AS UNSIGNED) DESC 
                 LIMIT 1) as receive_date
            FROM in_receive
            WHERE logistic_num IS NOT NULL AND logistic_num != ''
        """)
        
        if receive_df.empty:
            return JsonResponse({'success': True, 'data': [], 'count': 0})
        
        logistic_nums = receive_df['logistic_num'].tolist()
        
        # 1b. 检查每个物流单号是否已删除（最新的记录 note 以'删除订单'开头）
        delete_check_df = DBClient.read_df("""
            WITH latest_records AS (
                SELECT 
                    logistic_num,
                    note,
                    ROW_NUMBER() OVER (PARTITION BY logistic_num ORDER BY CAST(REGEXP_REPLACE(seq, '[^0-9]', '') AS UNSIGNED) DESC) as rn
                FROM in_receive
                WHERE logistic_num IN :logistic_nums
            )
            SELECT logistic_num, note
            FROM latest_records
            WHERE rn = 1
        """, {'logistic_nums': tuple(logistic_nums) if logistic_nums else ('',)})
        
        deleted_map = {}
        for _idx, row in delete_check_df.iterrows():
            lnum = row['logistic_num']
            note = row['note'] or ''
            deleted_map[lnum] = note.startswith('删除订单')
        
        # 2. 获取每个物流单号的最大seq及其update_date
        seq_df = DBClient.read_df("""
            SELECT 
                logistic_num,
                seq,
                update_date,
                CAST(REGEXP_REPLACE(seq, '[^0-9]', '') AS UNSIGNED) as seq_num
            FROM in_receive_final
            WHERE logistic_num IN :logistic_nums
            ORDER BY logistic_num, seq_num DESC
        """, {'logistic_nums': tuple(logistic_nums) if logistic_nums else ('',)})
        
        # 构建 logistic_num -> (seq, update_date) 映射
        seq_map = {}
        if not seq_df.empty:
            for _idx, row in seq_df.iterrows():
                lnum = row['logistic_num']
                if lnum not in seq_map:
                    seq_map[lnum] = {
                        'seq': row['seq'] or 'V01',
                        'update_date': str(row['update_date']) if row['update_date'] else '-'
                    }
        
        # 3. 计算入库状态（参照发货单管理的逻辑）
        # 获取 in_send_final 数据
        send_df = DBClient.read_df("""
            SELECT 
                sent_logistic_num as logistic_num,
                po_num,
                po_sku,
                po_price,
                sent_quantity
            FROM in_send_final
            WHERE sent_logistic_num IN :logistic_nums
        """, {'logistic_nums': tuple(logistic_nums) if logistic_nums else ('',)})
        
        # 构建 send 数据 map
        send_map = {}
        for _idx, row in send_df.iterrows():
            lnum = row['logistic_num']
            if lnum not in send_map:
                send_map[lnum] = {}
            key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
            send_map[lnum][key] = int(row['sent_quantity']) if row['sent_quantity'] else 0
        
        # 获取 in_receive_final 详细数据
        receive_detail_df = DBClient.read_df("""
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
        for _idx, row in receive_detail_df.iterrows():
            lnum = row['logistic_num']
            if lnum not in receive_map:
                receive_map[lnum] = {}
            key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
            receive_map[lnum][key] = int(row['receive_quantity']) if row['receive_quantity'] else 0
        
        # 获取 in_diff_final 数据（终态表，直接反映异常处理结果）
        diff_df = DBClient.read_df("""
            SELECT 
                logistic_num,
                po_num,
                po_sku,
                diff_quantity
            FROM in_diff_final
            WHERE logistic_num IN :logistic_nums
        """, {'logistic_nums': tuple(logistic_nums) if logistic_nums else ('',)})
        
        # 构建 diff 状态 map - 使用 diff_quantity 判断
        diff_qty_map = {}
        for _idx, row in diff_df.iterrows():
            lnum = row['logistic_num']
            if lnum not in diff_qty_map:
                diff_qty_map[lnum] = []
            diff_qty_map[lnum].append(int(row['diff_quantity']) if row['diff_quantity'] else 0)
        
        # 计算状态
        def calc_receive_status(logistic_num):
            receive_data = receive_map.get(logistic_num, {})
            send_data = send_map.get(logistic_num, {})
            
            if not receive_data:
                return ('IN_TRANSIT', _('货物在途中'), True, True)
            
            # 计算是否所有行都匹配
            all_match = True
            has_receive = False
            
            for key, sent_qty in send_data.items():
                receive_qty = receive_data.get(key, 0)
                
                if receive_qty > 0:
                    has_receive = True
                
                if sent_qty != receive_qty:
                    all_match = False
            
            if not has_receive:
                return ('IN_TRANSIT', _('货物在途中'), True, True)
            
            if all_match:
                return ('ALL_RECEIVED', _('全部已入库'), False, False)
            
            # 有差异 - 使用 diff_quantity 判断
            diff_quantities = diff_qty_map.get(logistic_num, [])
            if not diff_quantities:
                return ('DIFF_UNRESOLVED', _('入库有差异:未解决'), False, False)
            
            # 所有 diff_quantity 都为 0 表示已解决
            if all(dq == 0 for dq in diff_quantities):
                return ('DIFF_RESOLVED', _('入库有差异:已解决'), False, False)
            else:
                return ('DIFF_UNRESOLVED', _('入库有差异:未解决'), False, False)
        
        # 4. 构建返回数据
        orders = []
        for _idx, row in receive_df.iterrows():
            lnum = row['logistic_num']
            seq_info = seq_map.get(lnum, {'seq': 'V01', 'update_date': '-'})
            receive_status_code, receive_status_display, can_modify, can_delete = calc_receive_status(lnum)
            is_deleted = deleted_map.get(lnum, False)
            receive_date = str(row['receive_date']) if row['receive_date'] else '-'
            
            # 如果已删除，状态标记为已删除
            if is_deleted:
                receive_status_code = 'DELETED'
                receive_status_display = _('已删除')
            
            # 检查是否有入库文件
            has_file = check_has_receive_file(lnum, receive_date)
            
            orders.append({
                'logistic_num': lnum,
                'receive_date': receive_date,
                'receive_date': receive_date,
                'receive_status': receive_status_display,
                'receive_status_code': receive_status_code,
                'detail_seq': seq_info['seq'],
                'update_date': seq_info['update_date'],
                'can_modify': can_modify and not is_deleted,
                'can_delete': can_delete and not is_deleted,
                'is_deleted': is_deleted,
                'has_file': has_file,
            })
        
        # 5. 排序
        sort_key_map = {
            'logistic_num': lambda x: x['logistic_num'],
            'receive_date': lambda x: x['receive_date']
        }
        orders.sort(key=sort_key_map[sort_by], reverse=(sort_order == 'desc'))
        
        return JsonResponse({
            'success': True,
            'data': orders,
            'count': len(orders)
        })
        
    except Exception as e:
        logger.exception("获取入库记录列表失败")
        return JsonResponse({
            'success': False,
            'message': _('获取入库记录列表失败: %(error)s') % {'error': str(e)}
        }, status=500)

