"""
新建采购订单 - 提交API

[审计修复 2026-01-02]:
- P0-1: 添加数据库事务保护
- P1-1: 统一 check_perm 导入
- P1-2: 添加安全策略验证
- P2-2: 日期处理统一
- P2-3: 返回格式统一
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.utils.translation import gettext as _
import json
from datetime import date as date_type
from decimal import Decimal

from ..hub import check_perm
from core.services.security.policy_manager import SecurityPolicyManager
from core.components.db.client import DBClient
from apps.purchase.utils import extract_date_from_po_num

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_po_api(request):
    """
    提交采购订单
    
    数据库写入：
    1. in_po 表 - 每个商品一行
    2. in_po_strategy 表 - 订单策略一行
    
    po_num 格式: {supplier_code}{YYYYMMDD}-S{seq:02d}
    例如: XX20251201-S01
    
    Permission: module.purchase.po.add
    """
    if not check_perm(request.user, 'module.purchase.po.add'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    # P1-2: 安全策略验证
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, 'btn_po_create')
    if not is_valid:
        return JsonResponse({'success': False, 'message': sec_msg or _('密码验证失败')}, status=403)
    
    try:
        data = json.loads(request.body)
        
        # 提取订单参数
        supplier_code = data.get('supplier_code', '').strip()
        po_date = data.get('po_date', '').strip()
        currency = data.get('currency', 'RMB')
        exchange_rate = Decimal(str(data.get('exchange_rate', 1)))
        cur_mode = data.get('cur_mode', 'M')  # 汇率获取方式: A=自动, M=手动
        float_enabled = data.get('float_enabled', False)
        float_threshold = Decimal(str(data.get('float_threshold', 0)))
        deposit_required = data.get('deposit_required', False)
        deposit_percentage = Decimal(str(data.get('deposit_percentage', 0)))
        items = data.get('items', [])
        operator = request.user.username
        
        # 验证供应商代码（2个字母，来自in_supplier）
        if len(supplier_code) != 2 or not supplier_code.isalpha():
            return JsonResponse({
                'success': False,
                'message': _('供应商代码必须是2个字母')
            })
        
        # 验证供应商存在
        supplier_df = DBClient.read_df(
            "SELECT supplier_code FROM in_supplier WHERE supplier_code = :code",
            {'code': supplier_code}
        )
        if supplier_df.empty:
            return JsonResponse({
                'success': False,
                'message': _('供应商代码 {supplier_code} 不存在').format(supplier_code=supplier_code)
            })
        
        # 生成订单号: {supplier_code}{YYYYMMDD}-S{seq:02d}
        date_str = po_date.replace('-', '')  # YYYYMMDD
        po_prefix = f"{supplier_code}{date_str}-S"
        
        # 查询当天该供应商的最大序号
        seq_df = DBClient.read_df(
            """
            SELECT po_num FROM in_po 
            WHERE po_num LIKE :prefix 
            ORDER BY po_num DESC 
            LIMIT 1
            """,
            {'prefix': f"{po_prefix}%"}
        )
        
        if not seq_df.empty and seq_df.iloc[0]['po_num']:
            last_po_num = seq_df.iloc[0]['po_num']
            try:
                last_seq = int(last_po_num.split('-S')[1])
                seq = last_seq + 1
            except (IndexError, ValueError):
                seq = 1
        else:
            seq = 1
        
        po_num = f"{po_prefix}{seq:02d}"
        
        # P2-2: 统一日期处理
        today_date = date_type.today().isoformat()
        
        # P0-1: 使用事务包裹所有写入操作
        with DBClient.atomic_transaction() as conn:
            # 1. 插入订单明细 (in_po) - 每个商品一行
            for item in items:
                DBClient.execute_stmt(
                """
                INSERT INTO in_po 
                (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, currency, usd_rmb, `by`, action, note, seq)
                VALUES (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price, :currency, :usd_rmb, :by_user, :action, :note, :seq)
                """,
                {
                    'update_date': po_date,
                    'supplier_code': supplier_code,
                    'po_num': po_num,
                    'po_sku': item['sku'],
                    'po_quantity': int(item['qty']),
                    'po_price': Decimal(str(item['unit_price'])),
                    'currency': currency,
                    'usd_rmb': exchange_rate,
                    'by_user': operator,
                    'action': 'new',
                    'note': '原始订单',
                    'seq': 'L01'
                }
            )
            
                # 同时插入 in_po_final 表
                po_date_from_num = extract_date_from_po_num(po_num)
                DBClient.execute_stmt(
                """
                INSERT INTO in_po_final 
                (po_date, po_update_date, po_num, po_sku, po_quantity, po_price, po_note, po_seq, po_by)
                VALUES (:po_date, :po_update_date, :po_num, :po_sku, :po_quantity, :po_price, :po_note, :po_seq, :po_by)
                """,
                {
                    'po_date': po_date_from_num,
                    'po_update_date': today_date,
                    'po_num': po_num,
                    'po_sku': item['sku'],
                    'po_quantity': int(item['qty']),
                    'po_price': Decimal(str(item['unit_price'])),
                    'po_note': '原始订单',
                    'po_seq': 'L01',
                    'po_by': operator
                }
            )
        
        # 2. 查询 in_po_strategy 表中该 po_num 的最大 seq
        strategy_seq_df = DBClient.read_df(
            """
            SELECT seq FROM in_po_strategy 
            WHERE po_num = :po_num 
            ORDER BY seq DESC 
            LIMIT 1
            """,
            {'po_num': po_num}
        )
        
        if not strategy_seq_df.empty and strategy_seq_df.iloc[0]['seq']:
            last_version = strategy_seq_df.iloc[0]['seq']
            try:
                last_v_num = int(last_version.replace('V', ''))
                strategy_seq = f"V{last_v_num + 1:02d}"
            except ValueError:
                strategy_seq = "V01"
        else:
            strategy_seq = "V01"
        
        # 3. 插入订单策略 (in_po_strategy)
        cur_float_val = 1 if float_enabled else 0
        cur_ex_float_val = float_threshold if float_enabled else Decimal('0')
        cur_deposit_val = 1 if deposit_required else 0
        cur_deposit_par_val = deposit_percentage if deposit_required else Decimal('0')
        note_val = '原始订单'
        
        DBClient.execute_stmt(
            """
            INSERT INTO in_po_strategy 
            (date, po_num, cur_currency, cur_float, cur_ex_float, cur_deposit, cur_deposit_par, cur_usd_rmb, cur_mode, note, `by`, seq)
            VALUES (:date, :po_num, :cur_currency, :cur_float, :cur_ex_float, :cur_deposit, :cur_deposit_par, :cur_usd_rmb, :cur_mode, :note, :by_user, :seq)
            """,
            {
                'date': po_date,
                'po_num': po_num,
                'cur_currency': currency,
                'cur_float': cur_float_val,
                'cur_ex_float': cur_ex_float_val,
                'cur_deposit': cur_deposit_val,
                'cur_deposit_par': cur_deposit_par_val,
                'cur_usd_rmb': exchange_rate,
                'cur_mode': cur_mode,
                'note': note_val,
                'by_user': operator,
                'seq': strategy_seq
            }
        )
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"新建采购订单: {po_num}", extra={
            "user": operator,
            "func": "Purchase:POCreate",
            "action": "CREATE_PO",
            "target": po_num
        })
        
        return JsonResponse({
            'success': True,
            'message': _('采购订单创建成功'),
            'po_num': po_num,
            'item_count': len(items),
            'strategy_seq': strategy_seq,
            'detail_seq': 'L01'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('请求数据格式错误')}, status=400)
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({'success': False, 'message': _('订单创建失败: {error}').format(error=str(e))}, status=500)
