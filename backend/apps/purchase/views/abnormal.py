"""
入库异常处理模块

功能：
- 展示入库异常列表（in_diff_final表）
- 按(logistic_num, receive_date)分组聚合
- 支持处理异常、查看详情、删除/恢复等操作

[Created 2026-01-02]
"""
import logging

from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET, require_POST

from .hub import check_perm
from core.components.db.client import DBClient
from core.sys.logger import get_audit_logger

from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)
audit_logger = get_audit_logger()


# ===========================================
# 页面视图
# ===========================================

@login_required(login_url='web_ui:login')
def abnormal_page(request):
    """
    入库异常处理主页面
    Permission: module.purchase.receive.mgmt
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return render(request, "errors/403.html", status=403)
    
    return render(request, 'purchase/pages/abnormal.html')


# ===========================================
# API 视图
# ===========================================

@login_required(login_url='web_ui:login')
@require_GET
def abnormal_list_api(request):
    """
    获取入库异常列表
    按(logistic_num, receive_date)分组聚合
    
    参数:
        sort_order: asc/desc (默认desc)
        status: pending/done/空 (空表示全部)
    
    返回: [{logistic_num, receive_date, status, note, sku_count, total_diff}, ...]
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    try:
        # 获取筛选参数
        sort_order = request.GET.get('sort_order', 'desc').lower()
        status_filter = request.GET.get('status', '').strip()
        
        # 安全校验排序方向
        if sort_order not in ('asc', 'desc'):
            sort_order = 'desc'
        
        # 查询 in_diff_final，通过 note 字段判断删除状态
        sql = """
            SELECT 
                logistic_num,
                receive_date,
                CASE 
                    WHEN MAX(CASE WHEN note LIKE '删除异常处理%' THEN 1 ELSE 0 END) = 1 THEN 'deleted'
                    WHEN SUM(ABS(diff_quantity)) = 0 THEN 'done'
                    ELSE 'pending'
                END as status,
                GROUP_CONCAT(DISTINCT note SEPARATOR '; ') as note,
                COUNT(DISTINCT po_sku) as sku_count,
                SUM(diff_quantity) as total_diff
            FROM in_diff_final
            GROUP BY logistic_num, receive_date
        """
        df = DBClient.read_df(sql)
        
        items = []
        if not df.empty:
            for _idx, row in df.iterrows():
                status = row['status'] or 'pending'
                items.append({
                    'logistic_num': row['logistic_num'],
                    'receive_date': str(row['receive_date']) if row['receive_date'] else '',
                    'status': status,
                    'note': row['note'] or '',
                    'sku_count': int(row['sku_count']) if row['sku_count'] else 0,
                    'total_diff': int(row['total_diff']) if row['total_diff'] else 0,
                    'is_deleted': status == 'deleted'
                })
        
        # 应用状态筛选
        if status_filter == 'pending':
            items = [i for i in items if i['status'] == 'pending']
        elif status_filter == 'done':
            items = [i for i in items if i['status'] == 'done']
        elif status_filter == 'deleted':
            items = [i for i in items if i['status'] == 'deleted']
        
        # 排序
        items.sort(key=lambda x: (x['receive_date'], x['logistic_num']), reverse=(sort_order == 'desc'))
        
        return JsonResponse({
            'success': True,
            'data': items,
            'total': len(items)
        })
        
    except Exception as e:
        logger.exception("获取异常列表失败")
        return JsonResponse({
            'success': False,
            'message': f'加载失败: {str(e)}'
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def abnormal_detail_api(request):
    """
    获取异常详情
    参数: logistic_num, receive_date
    返回: 该异常的所有SKU明细（含价格、货币）
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '')
    receive_date = request.GET.get('receive_date', '')
    
    if not logistic_num or not receive_date:
        return JsonResponse({'success': False, 'message': _('参数不完整')}, status=400)
    
    try:
        df = DBClient.read_df("""
            SELECT 
                record_num,
                po_num,
                po_sku,
                po_quantity,
                sent_quantity,
                receive_quantity,
                diff_quantity,
                status,
                note,
                seq,
                `by`
            FROM in_diff_final
            WHERE logistic_num = :logistic_num
              AND receive_date = :receive_date
            ORDER BY po_num, po_sku
        """, {'logistic_num': logistic_num, 'receive_date': receive_date})
        
        if df.empty:
            return JsonResponse({
                'success': True,
                'data': [],
                'summary': None
            })
        
        # 获取物流单号
        logistic_num = request.GET.get('logistic_num', '')
        
        # 1. 从 in_receive_final 获取价格信息 (logistic_num + po_num + po_sku -> po_price)
        #    这是入库时实际关联的价格，支持同SKU多价格的情况
        price_map = {}  # {(po_num, po_sku): po_price}
        if logistic_num:
            price_df = DBClient.read_df("""
                SELECT po_num, po_sku, po_price
                FROM in_receive_final
                WHERE logistic_num = :logistic_num
            """, {'logistic_num': logistic_num})
            
            if not price_df.empty:
                for _idx, prow in price_df.iterrows():
                    key = (prow['po_num'], prow['po_sku'])
                    # 如果有多个价格，取第一个（按入库记录顺序）
                    if key not in price_map:
                        price_map[key] = float(prow['po_price']) if prow['po_price'] else 0.0
        
        # 获取所有相关订单号
        po_nums = df['po_num'].unique().tolist()
        
        # 2. 从 in_po_strategy 获取货币信息（取每个订单最新策略）
        currency_map = {}  # {po_num: cur_currency}
        if po_nums:
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
                for _idx, crow in currency_df.iterrows():
                    currency_map[crow['po_num']] = crow['cur_currency'] or 'RMB'
        
        items = []
        for _idx, row in df.iterrows():
            po_num = row['po_num']
            po_sku = row['po_sku']
            
            # 状态通过 diff_quantity 判断
            diff_qty = int(row['diff_quantity']) if row['diff_quantity'] else 0
            item_status = 'pending' if diff_qty != 0 else 'done'
            
            items.append({
                'record_num': row['record_num'],
                'po_num': po_num,
                'po_sku': po_sku,
                'currency': currency_map.get(po_num, 'RMB'),
                'po_price': price_map.get((po_num, po_sku), 0.0),
                'po_quantity': int(row['po_quantity']) if row['po_quantity'] else 0,
                'sent_quantity': int(row['sent_quantity']) if row['sent_quantity'] else 0,
                'receive_quantity': int(row['receive_quantity']) if row['receive_quantity'] else 0,
                'diff_quantity': diff_qty,
                'status': item_status,
                'note': row['note'] or '',
                'seq': row['seq'] or '',
                'by': row['by'] or ''
            })
        
        # 汇总信息 - 通过 diff_quantity 判断整体状态
        total_diff = sum(abs(int(r['diff_quantity'])) if r['diff_quantity'] else 0 for _idx, r in df.iterrows())
        summary = {
            'total_skus': len(items),
            'total_diff': sum(item['diff_quantity'] for item in items),
            'status': 'done' if total_diff == 0 else 'pending'
        }
        
        return JsonResponse({
            'success': True,
            'data': items,
            'summary': summary
        })
        
    except Exception as e:
        logger.exception("获取异常详情失败")
        return JsonResponse({
            'success': False,
            'message': _('加载失败: %(error)s') % {'error': str(e)}
        }, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def abnormal_process_api(request):
    """
    处理异常 API
    
    POST Body:
    {
        logistic_num: 物流单号,
        receive_date: 入库日期,
        note: 处理备注,
        delay_date: 延迟入库日期 (策略3时需要),
        po_methods: {
            po_num: { positive: method_id, negative: method_id },
            ...
        }
    }
    
    策略ID:
    1 - 仅修正发货单
    2 - 同步修正发货单与订单
    3 - 延迟入库 (仅用于少收)
    4 - 厂商错误
    
    Note格式: 差异校正修改_{用户名}_{版本号}_{操作时间YYYY-MM-DD}
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    # 安全验证
    from core.services.security.policy_manager import SecurityPolicyManager
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_abnormal_process')
    if not is_valid:
        return JsonResponse({'success': False, 'message': msg}, status=403)
    
    try:
        import json
        from datetime import date as date_type
        from apps.purchase.utils import extract_date_from_po_num
        
        data = json.loads(request.body)
        logistic_num = data.get('logistic_num', '').strip()
        receive_date = data.get('receive_date', '').strip()
        note = data.get('note', '').strip()
        delay_date = data.get('delay_date', '').strip()
        po_methods = data.get('po_methods', {})
        
        if not logistic_num or not receive_date:
            return JsonResponse({'success': False, 'message': _('参数不完整')}, status=400)
        
        if not po_methods:
            return JsonResponse({'success': False, 'message': _('未选择处理策略')}, status=400)
        
        operator = request.user.username
        today = date_type.today().isoformat()
        
        # 获取差异记录（diff_quantity != 0 表示待处理）
        diff_df = DBClient.read_df("""
            SELECT d.*, rf.po_price
            FROM in_diff_final d
            LEFT JOIN in_receive_final rf ON d.logistic_num = rf.logistic_num 
                AND d.po_num = rf.po_num AND d.po_sku = rf.po_sku
            WHERE d.logistic_num = :logistic_num
              AND d.receive_date = :receive_date
              AND d.diff_quantity != 0
        """, {'logistic_num': logistic_num, 'receive_date': receive_date})
        
        if diff_df.empty:
            return JsonResponse({'success': False, 'message': _('未找到待处理的差异记录')}, status=404)
        
        # 统计处理结果
        processed_count = 0
        errors = []
        
        # 使用事务
        with DBClient.atomic_transaction():
            for _idx, diff_row in diff_df.iterrows():
                po_num = diff_row['po_num']
                po_sku = diff_row['po_sku']
                diff_quantity = int(diff_row['diff_quantity'])
                sent_quantity = int(diff_row['sent_quantity'])
                receive_quantity = int(diff_row['receive_quantity'])
                po_price = float(diff_row['po_price']) if diff_row['po_price'] else 0.0
                
                # 判断差异类型
                if diff_quantity > 0:
                    diff_type = 'positive'  # 少收
                elif diff_quantity < 0:
                    diff_type = 'negative'  # 多收
                else:
                    continue  # 无差异，跳过
                
                # 获取该订单的策略
                po_selection = po_methods.get(po_num, {})
                method = po_selection.get(diff_type)
                
                if not method:
                    continue  # 未选择策略，跳过
                
                method = int(method)
                
                # 策略标识（字母后缀）：M1/M2/M3/M4
                # 前端可解析：M1=仅修正发货单, M2=同步修正, M3=延迟入库, M4=厂商错误
                method_code = f"M{method}"
                
                # 构建note：保持原格式，末尾添加策略标识
                version = f"V{processed_count + 1:02d}"
                process_note = f"差异校正修改_{operator}_{version}_{today}"
                if note:
                    process_note += f"_{note}"
                # 添加策略标识后缀
                process_note += f"#{method_code}"
                
                try:
                    if method == 1:
                        # 策略1: 仅修正发货单
                        _process_method_1(
                            logistic_num, po_num, po_sku, po_price,
                            receive_quantity, process_note, operator, today
                        )
                    elif method == 2:
                        # 策略2: 同步修正发货单与订单
                        _process_method_2(
                            logistic_num, po_num, po_sku, po_price,
                            receive_quantity, process_note, operator, today
                        )
                    elif method == 3:
                        # 策略3: 延迟入库 (仅少收)
                        if diff_type != 'positive':
                            errors.append(f"{po_num}/{po_sku}: " + _("策略3仅适用于少收情况"))
                            continue
                        _process_method_3(
                            logistic_num, po_num, po_sku, po_price,
                            abs(diff_quantity), delay_date, receive_date,
                            process_note, operator, today
                        )
                    elif method == 4:
                        # 策略4: 厂商错误
                        _process_method_4(
                            logistic_num, po_num, po_sku, po_price,
                            diff_quantity, diff_type, receive_date,
                            process_note, operator, today
                        )
                    else:
                        errors.append(f"{po_num}/{po_sku}: " + _("未知策略 %(method)s") % {'method': method})
                        continue
                    
                    # ========== 写入 in_diff 明细表 ==========
                    # 获取新seq
                    diff_seq_df = DBClient.read_df("""
                        SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
                        FROM in_diff
                        WHERE logistic_num = :logistic_num AND po_num = :po_num AND po_sku = :po_sku
                    """, {'logistic_num': logistic_num, 'po_num': po_num, 'po_sku': po_sku})
                    max_diff_seq = int(diff_seq_df.iloc[0]['max_num']) if not diff_seq_df.empty and diff_seq_df.iloc[0]['max_num'] else 0
                    new_diff_seq = f"D{str(max_diff_seq + 1).zfill(2)}"
                    
                    # 获取po_quantity
                    po_qty_df = DBClient.read_df("""
                        SELECT SUM(po_quantity) as total_qty
                        FROM in_po_final
                        WHERE po_num = :po_num AND po_sku = :po_sku
                    """, {'po_num': po_num, 'po_sku': po_sku})
                    po_quantity = int(po_qty_df.iloc[0]['total_qty']) if not po_qty_df.empty and po_qty_df.iloc[0]['total_qty'] else 0
                    
                    record_num = f"{logistic_num}_{receive_date}"
                    
                    DBClient.execute_stmt("""
                        INSERT INTO in_diff 
                        (record_num, logistic_num, po_num, receive_date, po_sku, 
                         po_quantity, sent_quantity, receive_quantity, diff_quantity,
                         status, action, note, seq, `by`)
                        VALUES 
                        (:record_num, :logistic_num, :po_num, :receive_date, :po_sku,
                         :po_quantity, :sent_quantity, :receive_quantity, :diff_quantity,
                         :status, :action, :note, :seq, :by)
                    """, {
                        'record_num': record_num,
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'receive_date': receive_date,
                        'po_sku': po_sku,
                        'po_quantity': po_quantity,
                        'sent_quantity': sent_quantity,
                        'receive_quantity': receive_quantity,
                        'diff_quantity': diff_quantity,
                        'status': 'resolved',
                        'action': 'adjust',
                        'note': process_note,
                        'seq': new_diff_seq,
                        'by': operator
                    })
                    
                    # ========== 更新 in_diff_final 终态表 ==========
                    # 差异已解决：sent_quantity更新为receive_quantity，diff_quantity设为0
                    # 不删除记录，保留用于展示"该差异已被修正"
                    DBClient.execute_stmt("""
                        UPDATE in_diff_final 
                        SET sent_quantity = :new_sent_quantity,
                            diff_quantity = 0,
                            note = :process_note,
                            seq = :seq,
                            `by` = :operator
                        WHERE logistic_num = :logistic_num
                          AND po_num = :po_num
                          AND po_sku = :po_sku
                    """, {
                        'new_sent_quantity': receive_quantity,  # 修正后发货量=入库量
                        'process_note': process_note,
                        'seq': new_diff_seq,
                        'operator': operator,
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'po_sku': po_sku
                    })
                    
                    processed_count += 1
                    
                except Exception as e:
                    errors.append(f"{po_num}/{po_sku}: {str(e)}")
                    logger.exception(f"处理 {po_num}/{po_sku} 失败")
        
        # 记录审计日志
        audit_logger.info(f"异常处理完成: {logistic_num}", extra={
            "user": operator,
            "func": "Purchase:AbnormalProcess",
            "action": "PROCESS_ABNORMAL",
            "target": logistic_num
        })
        
        return JsonResponse({
            'success': True,
            'message': _('处理完成，共处理 %(count)s 条差异') % {'count': processed_count},
            'data': {
                'processed_count': processed_count,
                'errors': errors if errors else None
            }
        })
        
    except Exception as e:
        logger.exception("异常处理失败")
        return JsonResponse({
            'success': False,
            'message': _('处理失败: %(error)s') % {'error': str(e)}
        }, status=500)


def _get_next_seq(table_name: str, key_col: str, key_val: str, seq_col: str = 'seq', prefix: str = 'L') -> str:
    """获取下一个版本号"""
    # 安全白名单
    ALLOWED_TABLES = {'in_po', 'in_send', 'in_send_list', 'in_receive', 'in_diff'}
    ALLOWED_KEY_COLS = {'po_num', 'logistic_num'}
    ALLOWED_SEQ_COLS = {'seq', 'sent_seq'}
    
    if table_name not in ALLOWED_TABLES:
        raise ValueError(f"Invalid table: {table_name}")
    if key_col not in ALLOWED_KEY_COLS:
        raise ValueError(f"Invalid key_col: {key_col}")
    if seq_col not in ALLOWED_SEQ_COLS:
        raise ValueError(f"Invalid seq_col: {seq_col}")
    
    seq_df = DBClient.read_df(f"""
        SELECT MAX(CAST(SUBSTRING({seq_col}, 2) AS UNSIGNED)) as max_num
        FROM {table_name}
        WHERE {key_col} = :key_val
    """, {'key_val': key_val})
    
    max_num = int(seq_df.iloc[0]['max_num']) if not seq_df.empty and seq_df.iloc[0]['max_num'] else 0
    return f"{prefix}{str(max_num + 1).zfill(2)}"


def _process_method_1(logistic_num, po_num, po_sku, po_price, new_quantity, note, operator, today):
    """
    策略1: 仅修正发货单
    顺序: 发货明细 → 发货终态 → 入库终态(sent_quantity)
    """
    # 获取新seq
    new_seq = _get_next_seq('in_send_list', 'logistic_num', logistic_num)
    
    # 1. in_send_list: INSERT
    DBClient.execute_stmt("""
        INSERT INTO in_send_list 
        (date, logistic_num, po_num, sku, quantity, price, action, note, `by`, po_change, seq)
        VALUES 
        (:date, :logistic_num, :po_num, :sku, :quantity, :price, 'adjust', :note, :by_user, 'N', :seq)
    """, {
        'date': today,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'sku': po_sku,
        'quantity': new_quantity,
        'price': po_price,
        'note': note,
        'by_user': operator,
        'seq': new_seq
    })
    
    # 2. in_send_final: UPDATE
    DBClient.execute_stmt("""
        UPDATE in_send_final 
        SET sent_quantity = :quantity,
            sent_update_date = :update_date,
            sent_note = :note,
            sent_seq = :seq,
            sent_by = :by_user
        WHERE sent_logistic_num = :logistic_num
          AND po_num = :po_num
          AND po_sku = :po_sku
          AND ABS(po_price - :po_price) < 0.001
    """, {
        'quantity': new_quantity,
        'update_date': today,
        'note': note,
        'seq': new_seq,
        'by_user': operator,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'po_sku': po_sku,
        'po_price': po_price
    })
    
    # 3. in_receive_final: UPDATE sent_quantity
    DBClient.execute_stmt("""
        UPDATE in_receive_final 
        SET sent_quantity = :quantity,
            update_date = :update_date,
            note = :note
        WHERE logistic_num = :logistic_num
          AND po_num = :po_num
          AND po_sku = :po_sku
          AND ABS(po_price - :po_price) < 0.001
    """, {
        'quantity': new_quantity,
        'update_date': today,
        'note': note,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'po_sku': po_sku,
        'po_price': po_price
    })


def _process_method_2(logistic_num, po_num, po_sku, po_price, new_quantity, note, operator, today):
    """
    策略2: 同步修正发货单与订单
    顺序: 订货明细 → 订货终态 → 发货明细 → 发货终态 → 入库终态(sent_quantity)
    """
    from apps.purchase.utils import extract_date_from_po_num
    
    # ========== 1. 订货明细 → 订货终态 ==========
    # 获取订单信息
    po_info_df = DBClient.read_df("""
        SELECT supplier_code, currency, usd_rmb
        FROM in_po
        WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
        ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
        LIMIT 1
    """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
    
    if po_info_df.empty:
        raise ValueError(f"找不到订单信息: {po_num}/{po_sku}")
    
    po_info = po_info_df.iloc[0]
    supplier_code = po_info['supplier_code'] or ''
    currency = po_info['currency'] or 'RMB'
    usd_rmb = float(po_info['usd_rmb']) if po_info['usd_rmb'] else 1.0
    
    # 获取新seq
    new_po_seq = _get_next_seq('in_po', 'po_num', po_num)
    
    # in_po: INSERT
    DBClient.execute_stmt("""
        INSERT INTO in_po 
        (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, currency, usd_rmb, `by`, action, note, seq)
        VALUES 
        (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price, :currency, :usd_rmb, :by_user, 'adjust', :note, :seq)
    """, {
        'update_date': today,
        'supplier_code': supplier_code,
        'po_num': po_num,
        'po_sku': po_sku,
        'po_quantity': new_quantity,
        'po_price': po_price,
        'currency': currency,
        'usd_rmb': usd_rmb,
        'by_user': operator,
        'note': note,
        'seq': new_po_seq
    })
    
    # in_po_final: 从 in_po 读取最新记录后更新
    po_date = extract_date_from_po_num(po_num)
    latest_po_df = DBClient.read_df("""
        SELECT update_date, po_quantity, note, seq, `by`
        FROM in_po 
        WHERE po_num = :po_num 
          AND po_sku = :po_sku 
          AND ABS(po_price - :po_price) < 0.001
        ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
        LIMIT 1
    """, {
        'po_num': po_num,
        'po_sku': po_sku,
        'po_price': po_price
    })
    
    if not latest_po_df.empty:
        latest = latest_po_df.iloc[0]
        DBClient.execute_stmt("""
            UPDATE in_po_final 
            SET po_update_date = :update_date,
                po_quantity = :quantity,
                po_note = :note,
                po_seq = :seq,
                po_by = :by_user
            WHERE po_num = :po_num
              AND po_sku = :po_sku
              AND ABS(po_price - :po_price) < 0.001
        """, {
            'update_date': str(latest['update_date']) if latest['update_date'] else today,
            'quantity': int(latest['po_quantity']) if latest['po_quantity'] else 0,
            'note': latest['note'] or '',
            'seq': latest['seq'] or new_po_seq,
            'by_user': latest['by'] or operator,
            'po_num': po_num,
            'po_sku': po_sku,
            'po_price': po_price
        })
    
    # ========== 2. 发货明细 → 发货终态 ==========
    new_send_seq = _get_next_seq('in_send_list', 'logistic_num', logistic_num)
    
    # in_send_list: INSERT
    DBClient.execute_stmt("""
        INSERT INTO in_send_list 
        (date, logistic_num, po_num, sku, quantity, price, action, note, `by`, po_change, seq)
        VALUES 
        (:date, :logistic_num, :po_num, :sku, :quantity, :price, 'adjust', :note, :by_user, 'N', :seq)
    """, {
        'date': today,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'sku': po_sku,
        'quantity': new_quantity,
        'price': po_price,
        'note': note,
        'by_user': operator,
        'seq': new_send_seq
    })
    
    # in_send_final: UPDATE
    DBClient.execute_stmt("""
        UPDATE in_send_final 
        SET sent_quantity = :quantity,
            sent_update_date = :update_date,
            sent_note = :note,
            sent_seq = :seq,
            sent_by = :by_user
        WHERE sent_logistic_num = :logistic_num
          AND po_num = :po_num
          AND po_sku = :po_sku
          AND ABS(po_price - :po_price) < 0.001
    """, {
        'quantity': new_quantity,
        'update_date': today,
        'note': note,
        'seq': new_send_seq,
        'by_user': operator,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'po_sku': po_sku,
        'po_price': po_price
    })
    
    # ========== 3. 入库终态 sent_quantity 同步 ==========
    DBClient.execute_stmt("""
        UPDATE in_receive_final 
        SET sent_quantity = :quantity,
            update_date = :update_date,
            note = :note
        WHERE logistic_num = :logistic_num
          AND po_num = :po_num
          AND po_sku = :po_sku
          AND ABS(po_price - :po_price) < 0.001
    """, {
        'quantity': new_quantity,
        'update_date': today,
        'note': note,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'po_sku': po_sku,
        'po_price': po_price
    })


def _process_method_3(logistic_num, po_num, po_sku, po_price, delay_quantity, delay_date, receive_date, note, operator, today):
    """
    策略3: 延迟入库 (仅用于少收)
    - 新建延迟入库发货单 {logistic_num}_delay_V##
    - in_send 的 price_kg/total_weight/total_price = 0 (子订单)
    """
    # 确定延迟发货单号
    existing_delay_df = DBClient.read_df("""
        SELECT logistic_num FROM in_send
        WHERE logistic_num LIKE :pattern
        ORDER BY logistic_num DESC
        LIMIT 1
    """, {'pattern': f"{logistic_num}_delay_%"})
    
    if existing_delay_df.empty:
        delay_logistic_num = f"{logistic_num}_delay_V01"
    else:
        last_delay = existing_delay_df.iloc[0]['logistic_num']
        try:
            last_num = int(last_delay.split('_delay_V')[1])
            delay_logistic_num = f"{logistic_num}_delay_V{str(last_num + 1).zfill(2)}"
        except:
            delay_logistic_num = f"{logistic_num}_delay_V01"
    
    # 1. in_send: INSERT 新发货单头 (price_kg/total_weight/total_price = 0)
    DBClient.execute_stmt("""
        INSERT INTO in_send 
        (date_sent, logistic_num, price_kg, total_weight, total_price, usd_rmb, mode, date_eta, pallets, note, date_record, `by`, seq)
        VALUES 
        (:date_sent, :logistic_num, 0, 0, 0, 1.0, 'A', :date_eta, 0, :note, :date_record, :by_user, 'V01')
    """, {
        'date_sent': delay_date,
        'logistic_num': delay_logistic_num,
        'date_eta': delay_date,
        'note': f"延迟入库子单_原单号:{logistic_num}_{note}",
        'date_record': today,
        'by_user': operator
    })
    
    # 2. in_send_list: INSERT
    DBClient.execute_stmt("""
        INSERT INTO in_send_list 
        (date, logistic_num, po_num, sku, quantity, price, action, note, `by`, po_change, seq)
        VALUES 
        (:date, :logistic_num, :po_num, :sku, :quantity, :price, 'new', :note, :by_user, 'N', 'L01')
    """, {
        'date': today,
        'logistic_num': delay_logistic_num,
        'po_num': po_num,
        'sku': po_sku,
        'quantity': delay_quantity,
        'price': po_price,
        'note': note,
        'by_user': operator
    })
    
    # 3. in_send_final: INSERT
    DBClient.execute_stmt("""
        INSERT INTO in_send_final 
        (sent_date, sent_update_date, sent_logistic_num, po_num, po_sku, sent_quantity, po_price, sent_note, sent_seq, sent_by)
        VALUES 
        (:sent_date, :update_date, :logistic_num, :po_num, :po_sku, :quantity, :po_price, :note, 'L01', :by_user)
    """, {
        'sent_date': delay_date,
        'update_date': today,
        'logistic_num': delay_logistic_num,
        'po_num': po_num,
        'po_sku': po_sku,
        'quantity': delay_quantity,
        'po_price': po_price,
        'note': note,
        'by_user': operator
    })


def _process_method_4(logistic_num, po_num, po_sku, po_price, diff_quantity, diff_type, receive_date, note, operator, today):
    """
    策略4: 厂商错误
    - 多收 (diff < 0): 多余货物以单价0入库，在订单/发货/入库都新增
    - 少收 (diff > 0): 以原价入库，在订单/发货/入库都新增
      TODO: 少收情况需要出库逻辑，待后续实现
    """
    from apps.purchase.utils import extract_date_from_po_num
    
    if diff_type == 'negative':
        # 多收: 以单价0入库
        extra_quantity = abs(diff_quantity)
        use_price = 0.0  # 0成本
        item_note = f"厂商错误_多收0成本入库_{note}"
    else:
        # 少收: 以原价入库 (但需要出库，TODO)
        extra_quantity = abs(diff_quantity)
        use_price = po_price  # 原价
        item_note = f"厂商错误_少收原价入库_TODO出库逻辑待实现_{note}"
        # TODO: 用户需要告知出库逻辑后在此处添加
    
    # 获取订单信息
    po_info_df = DBClient.read_df("""
        SELECT supplier_code, currency, usd_rmb
        FROM in_po
        WHERE po_num = :po_num
        ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
        LIMIT 1
    """, {'po_num': po_num})
    
    if po_info_df.empty:
        raise ValueError(f"找不到订单信息: {po_num}")
    
    po_info = po_info_df.iloc[0]
    supplier_code = po_info['supplier_code'] or ''
    currency = po_info['currency'] or 'RMB'
    usd_rmb = float(po_info['usd_rmb']) if po_info['usd_rmb'] else 1.0
    po_date = extract_date_from_po_num(po_num)
    
    # ========== 1. 新增订单记录 ==========
    new_po_seq = _get_next_seq('in_po', 'po_num', po_num)
    
    # in_po: INSERT
    DBClient.execute_stmt("""
        INSERT INTO in_po 
        (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, currency, usd_rmb, `by`, action, note, seq)
        VALUES 
        (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price, :currency, :usd_rmb, :by_user, 'add', :note, :seq)
    """, {
        'update_date': today,
        'supplier_code': supplier_code,
        'po_num': po_num,
        'po_sku': po_sku,
        'po_quantity': extra_quantity,
        'po_price': use_price,
        'currency': currency,
        'usd_rmb': usd_rmb,
        'by_user': operator,
        'note': item_note,
        'seq': new_po_seq
    })
    
    # in_po_final: 从 in_po 读取刚插入的记录后插入
    latest_po_df = DBClient.read_df("""
        SELECT update_date, po_quantity, note, seq, `by`
        FROM in_po 
        WHERE po_num = :po_num 
          AND po_sku = :po_sku 
          AND ABS(po_price - :po_price) < 0.001
        ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
        LIMIT 1
    """, {
        'po_num': po_num,
        'po_sku': po_sku,
        'po_price': use_price
    })
    
    if not latest_po_df.empty:
        latest = latest_po_df.iloc[0]
        DBClient.execute_stmt("""
            INSERT INTO in_po_final 
            (po_date, po_update_date, po_num, po_sku, po_quantity, po_price, po_note, po_seq, po_by)
            VALUES 
            (:po_date, :update_date, :po_num, :po_sku, :po_quantity, :po_price, :note, :seq, :by_user)
        """, {
            'po_date': po_date,
            'update_date': str(latest['update_date']) if latest['update_date'] else today,
            'po_num': po_num,
            'po_sku': po_sku,
            'po_quantity': int(latest['po_quantity']) if latest['po_quantity'] else 0,
            'po_price': use_price,
            'note': latest['note'] or '',
            'seq': latest['seq'] or new_po_seq,
            'by_user': latest['by'] or operator
        })
    
    # ========== 2. 新增发货记录 ==========
    new_send_seq = _get_next_seq('in_send_list', 'logistic_num', logistic_num)
    
    # in_send_list: INSERT
    DBClient.execute_stmt("""
        INSERT INTO in_send_list 
        (date, logistic_num, po_num, sku, quantity, price, action, note, `by`, po_change, seq)
        VALUES 
        (:date, :logistic_num, :po_num, :sku, :quantity, :price, 'add', :note, :by_user, 'N', :seq)
    """, {
        'date': today,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'sku': po_sku,
        'quantity': extra_quantity,
        'price': use_price,
        'note': item_note,
        'by_user': operator,
        'seq': new_send_seq
    })
    
    # in_send_final: INSERT
    # 获取原发货日期
    sent_date_df = DBClient.read_df("""
        SELECT sent_date FROM in_send_final
        WHERE sent_logistic_num = :logistic_num
        LIMIT 1
    """, {'logistic_num': logistic_num})
    sent_date = sent_date_df.iloc[0]['sent_date'] if not sent_date_df.empty else today
    
    DBClient.execute_stmt("""
        INSERT INTO in_send_final 
        (sent_date, sent_update_date, sent_logistic_num, po_num, po_sku, sent_quantity, po_price, sent_note, sent_seq, sent_by)
        VALUES 
        (:sent_date, :update_date, :logistic_num, :po_num, :po_sku, :quantity, :po_price, :note, :seq, :by_user)
    """, {
        'sent_date': sent_date,
        'update_date': today,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'po_sku': po_sku,
        'quantity': extra_quantity,
        'po_price': use_price,
        'note': item_note,
        'seq': new_send_seq,
        'by_user': operator
    })
    
    # ========== 3. 新增入库记录 ==========
    new_receive_seq = _get_next_seq('in_receive', 'logistic_num', logistic_num, prefix='V')
    
    # in_receive: INSERT
    DBClient.execute_stmt("""
        INSERT INTO in_receive 
        (sent_date, eta_date_final, receive_date, update_date, logistic_num, po_num, po_sku, 
         sent_quantity, receive_quantity, po_price, action, note, seq, `by`)
        VALUES 
        (:sent_date, :eta_date, :receive_date, :update_date, :logistic_num, :po_num, :po_sku,
         :sent_quantity, :receive_quantity, :po_price, 'add', :note, :seq, :by_user)
    """, {
        'sent_date': sent_date,
        'eta_date': receive_date,
        'receive_date': receive_date,
        'update_date': today,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'po_sku': po_sku,
        'sent_quantity': extra_quantity,
        'receive_quantity': extra_quantity,
        'po_price': use_price,
        'note': item_note,
        'seq': new_receive_seq,
        'by_user': operator
    })
    
    # in_receive_final: INSERT
    DBClient.execute_stmt("""
        INSERT INTO in_receive_final 
        (eta_date_final, receive_date, update_date, logistic_num, po_num, po_sku, 
         sent_quantity, receive_quantity, po_price, note, seq, `by`)
        VALUES 
        (:eta_date, :receive_date, :update_date, :logistic_num, :po_num, :po_sku,
         :sent_quantity, :receive_quantity, :po_price, :note, :seq, :by_user)
    """, {
        'eta_date': receive_date,
        'receive_date': receive_date,
        'update_date': today,
        'logistic_num': logistic_num,
        'po_num': po_num,
        'po_sku': po_sku,
        'sent_quantity': extra_quantity,
        'receive_quantity': extra_quantity,
        'po_price': use_price,
        'note': item_note,
        'seq': new_receive_seq,
        'by_user': operator
    })


@login_required(login_url='web_ui:login')
@require_GET
def abnormal_history_api(request):
    """
    获取异常历史记录 (从 in_diff 明细表读取)
    
    GET参数:
        logistic_num: 物流单号
        receive_date: 入库日期
    
    返回:
        历史修订记录列表，按版本号倒序
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '').strip()
    receive_date = request.GET.get('receive_date', '').strip()
    
    if not logistic_num:
        return JsonResponse({'success': False, 'message': _('缺少物流单号参数')}, status=400)
    
    try:
        # 从 in_diff 明细表读取历史记录
        df = DBClient.read_df("""
            SELECT 
                seq,
                receive_date,
                po_sku,
                sent_quantity,
                receive_quantity,
                diff_quantity,
                action,
                note,
                `by`
            FROM in_diff
            WHERE logistic_num = :logistic_num
            ORDER BY po_sku, CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
        """, {'logistic_num': logistic_num})
        
        if df.empty:
            return JsonResponse({
                'success': True,
                'data': [],
                'total': 0
            })
        
        items = []
        for _idx, row in df.iterrows():
            items.append({
                'seq': row['seq'] or '',
                'receive_date': str(row['receive_date']) if row['receive_date'] else '',
                'po_sku': row['po_sku'] or '',
                'sent_quantity': int(row['sent_quantity']) if row['sent_quantity'] else 0,
                'receive_quantity': int(row['receive_quantity']) if row['receive_quantity'] else 0,
                'diff_quantity': int(row['diff_quantity']) if row['diff_quantity'] else 0,
                'action': row['action'] or '',
                'note': row['note'] or '',
                'by': row['by'] or ''
            })
        
        return JsonResponse({
            'success': True,
            'data': items,
            'total': len(items)
        })
        
    except Exception as e:
        logger.exception("获取异常历史记录失败")
        return JsonResponse({
            'success': False,
            'message': f'加载失败: {str(e)}'
        }, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def abnormal_delete_api(request):
    """
    删除已处理的异常记录
    
    逻辑：
    1. 获取已处理记录的note（包含差异校正修改标识）
    2. 从各明细表删除匹配该note的行
    3. 从终态表重新计算（或删除）
    
    Body: { logistic_num, receive_date, sec_code_user }
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    try:
        import json
        import re
        from datetime import date as date_type
        from core.services.security.policy_manager import SecurityPolicyManager
        from apps.purchase.utils import inject_security_codes_to_post
        
        data = json.loads(request.body)
        logistic_num = data.get('logistic_num', '').strip()
        receive_date = data.get('receive_date', '').strip()
        
        if not logistic_num:
            return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
        
        # 安全验证
        inject_security_codes_to_post(request, data)
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_abnormal_delete')
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg}, status=403)
        
        operator = request.user.username or 'system'
        
        # 获取已处理的差异记录（diff_quantity=0，note包含策略标识）
        final_df = DBClient.read_df("""
            SELECT po_num, po_sku, note
            FROM in_diff_final
            WHERE logistic_num = :logistic_num
              AND receive_date = :receive_date
              AND diff_quantity = 0
              AND note LIKE '%#M%'
        """, {'logistic_num': logistic_num, 'receive_date': receive_date})
        
        if final_df.empty:
            return JsonResponse({'success': False, 'message': _('没有已处理的差异记录可删除')}, status=400)
        
        deleted_count = 0
        
        # 使用事务
        with DBClient.atomic_transaction():
            for _idx, row in final_df.iterrows():
                po_num = row['po_num']
                po_sku = row['po_sku']
                process_note = row['note']  # 差异校正修改_xxx_V01_2026-01-04#M1
                
                if not process_note:
                    continue
                
                # 解析策略
                method_match = re.search(r'#(M\d)$', process_note)
                method = int(method_match.group(1)[1]) if method_match else 1
                
                # 1. 从 in_diff 删除匹配note的行
                DBClient.execute_stmt("""
                    DELETE FROM in_diff
                    WHERE logistic_num = :logistic_num
                      AND po_num = :po_num
                      AND po_sku = :po_sku
                      AND note = :note
                """, {
                    'logistic_num': logistic_num,
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'note': process_note
                })
                
                # 2. 根据策略删除其他明细表的匹配行
                if method in [1, 2]:
                    # M1/M2: 从 in_send_list 删除
                    DBClient.execute_stmt("""
                        DELETE FROM in_send_list
                        WHERE logistic_num = :logistic_num
                          AND po_num = :po_num
                          AND sku = :po_sku
                          AND note = :note
                    """, {
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'note': process_note
                    })
                
                if method == 2:
                    # M2: 从 in_po 删除
                    DBClient.execute_stmt("""
                        DELETE FROM in_po
                        WHERE po_num = :po_num
                          AND po_sku = :po_sku
                          AND note = :note
                    """, {
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'note': process_note
                    })
                
                if method == 3:
                    # M3: 延迟入库 - 删除延迟发货单
                    # 延迟单号格式: {logistic_num}_delay_V##
                    # 先查找延迟发货单
                    delay_df = DBClient.read_df("""
                        SELECT DISTINCT sl.logistic_num as delay_logistic_num
                        FROM in_send_list sl
                        WHERE sl.logistic_num LIKE :pattern
                          AND sl.po_num = :po_num
                          AND sl.sku = :po_sku
                          AND sl.note = :note
                    """, {
                        'pattern': f"{logistic_num}_delay_%",
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'note': process_note
                    })
                    
                    for _idx, delay_row in delay_df.iterrows():
                        delay_logistic_num = delay_row['delay_logistic_num']
                        
                        # 从 in_send_list 删除
                        DBClient.execute_stmt("""
                            DELETE FROM in_send_list
                            WHERE logistic_num = :logistic_num
                              AND po_num = :po_num
                              AND sku = :po_sku
                              AND note = :note
                        """, {
                            'logistic_num': delay_logistic_num,
                            'po_num': po_num,
                            'po_sku': po_sku,
                            'note': process_note
                        })
                        
                        # 从 in_send_final 删除
                        DBClient.execute_stmt("""
                            DELETE FROM in_send_final
                            WHERE sent_logistic_num = :logistic_num
                              AND po_num = :po_num
                              AND po_sku = :po_sku
                              AND sent_note = :note
                        """, {
                            'logistic_num': delay_logistic_num,
                            'po_num': po_num,
                            'po_sku': po_sku,
                            'note': process_note
                        })
                        
                        # 检查该延迟单是否还有其他SKU，如果没有则删除 in_send 头记录
                        remaining_items = DBClient.read_df("""
                            SELECT COUNT(*) as cnt FROM in_send_list
                            WHERE logistic_num = :logistic_num
                        """, {'logistic_num': delay_logistic_num})
                        
                        if remaining_items.iloc[0]['cnt'] == 0:
                            # 删除 in_send 发货单头
                            DBClient.execute_stmt("""
                                DELETE FROM in_send
                                WHERE logistic_num = :logistic_num
                            """, {'logistic_num': delay_logistic_num})
                
                if method == 4:
                    # M4: 厂商错误 - 删除在订单/发货/入库中新增的记录
                    # note格式: 厂商错误_多收0成本入库_xxx 或 厂商错误_少收原价入库_xxx
                    
                    # 从 in_po 删除
                    DBClient.execute_stmt("""
                        DELETE FROM in_po
                        WHERE po_num = :po_num
                          AND po_sku = :po_sku
                          AND note LIKE :note_pattern
                    """, {
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'note_pattern': f"厂商错误_%{process_note}%"
                    })
                    
                    # 从 in_po_final 删除（M4会INSERT新记录）
                    DBClient.execute_stmt("""
                        DELETE FROM in_po_final
                        WHERE po_num = :po_num
                          AND po_sku = :po_sku
                          AND po_note LIKE :note_pattern
                    """, {
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'note_pattern': f"厂商错误_%{process_note}%"
                    })
                    
                    # 从 in_send_list 删除
                    DBClient.execute_stmt("""
                        DELETE FROM in_send_list
                        WHERE logistic_num = :logistic_num
                          AND po_num = :po_num
                          AND sku = :po_sku
                          AND note LIKE :note_pattern
                    """, {
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'note_pattern': f"厂商错误_%{process_note}%"
                    })
                    
                    # 从 in_send_final 删除（M4会INSERT新记录）
                    DBClient.execute_stmt("""
                        DELETE FROM in_send_final
                        WHERE sent_logistic_num = :logistic_num
                          AND po_num = :po_num
                          AND po_sku = :po_sku
                          AND sent_note LIKE :note_pattern
                    """, {
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'note_pattern': f"厂商错误_%{process_note}%"
                    })
                    
                    # 从 in_receive 删除
                    DBClient.execute_stmt("""
                        DELETE FROM in_receive
                        WHERE logistic_num = :logistic_num
                          AND po_num = :po_num
                          AND po_sku = :po_sku
                          AND note LIKE :note_pattern
                    """, {
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'note_pattern': f"厂商错误_%{process_note}%"
                    })
                    
                    # 从 in_receive_final 删除（M4会INSERT新记录）
                    DBClient.execute_stmt("""
                        DELETE FROM in_receive_final
                        WHERE logistic_num = :logistic_num
                          AND po_num = :po_num
                          AND po_sku = :po_sku
                          AND note LIKE :note_pattern
                    """, {
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'note_pattern': f"厂商错误_%{process_note}%"
                    })
                
                # 3. 重新计算终态表（从最新的明细记录）
                # 3.1 重新计算 in_diff_final
                latest_diff = DBClient.read_df("""
                    SELECT sent_quantity, receive_quantity, diff_quantity, note, seq
                    FROM in_diff
                    WHERE logistic_num = :logistic_num
                      AND po_num = :po_num
                      AND po_sku = :po_sku
                    ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
                    LIMIT 1
                """, {'logistic_num': logistic_num, 'po_num': po_num, 'po_sku': po_sku})
                
                if not latest_diff.empty:
                    ld = latest_diff.iloc[0]
                    DBClient.execute_stmt("""
                        UPDATE in_diff_final
                        SET sent_quantity = :sent_quantity,
                            diff_quantity = :diff_quantity,
                            note = :note,
                            seq = :seq
                        WHERE logistic_num = :logistic_num
                          AND receive_date = :receive_date
                          AND po_num = :po_num
                          AND po_sku = :po_sku
                    """, {
                        'logistic_num': logistic_num,
                        'receive_date': receive_date,
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'sent_quantity': int(ld['sent_quantity']) if ld['sent_quantity'] else 0,
                        'diff_quantity': int(ld['diff_quantity']) if ld['diff_quantity'] else 0,
                        'note': ld['note'] or '',
                        'seq': ld['seq'] or ''
                    })
                
                # 3.2 重新计算 in_send_final（如果是M1/M2）
                if method in [1, 2]:
                    latest_send = DBClient.read_df("""
                        SELECT quantity, note, seq
                        FROM in_send_list
                        WHERE logistic_num = :logistic_num
                          AND po_num = :po_num
                          AND sku = :po_sku
                        ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
                        LIMIT 1
                    """, {'logistic_num': logistic_num, 'po_num': po_num, 'po_sku': po_sku})
                    
                    if not latest_send.empty:
                        ls = latest_send.iloc[0]
                        DBClient.execute_stmt("""
                            UPDATE in_send_final
                            SET sent_quantity = :quantity,
                                sent_note = :note,
                                sent_seq = :seq
                            WHERE sent_logistic_num = :logistic_num
                              AND po_num = :po_num
                              AND po_sku = :po_sku
                        """, {
                            'logistic_num': logistic_num,
                            'po_num': po_num,
                            'po_sku': po_sku,
                            'quantity': int(ls['quantity']) if ls['quantity'] else 0,
                            'note': ls['note'] or '',
                            'seq': ls['seq'] or ''
                        })
                        
                        # 同步更新 in_receive_final.sent_quantity
                        DBClient.execute_stmt("""
                            UPDATE in_receive_final
                            SET sent_quantity = :quantity
                            WHERE logistic_num = :logistic_num
                              AND po_num = :po_num
                              AND po_sku = :po_sku
                        """, {
                            'logistic_num': logistic_num,
                            'po_num': po_num,
                            'po_sku': po_sku,
                            'quantity': int(ls['quantity']) if ls['quantity'] else 0
                        })
                
                # 3.3 重新计算 in_po_final（如果是M2）
                if method == 2:
                    latest_po = DBClient.read_df("""
                        SELECT po_quantity, note, seq
                        FROM in_po
                        WHERE po_num = :po_num
                          AND po_sku = :po_sku
                        ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
                        LIMIT 1
                    """, {'po_num': po_num, 'po_sku': po_sku})
                    
                    if not latest_po.empty:
                        lp = latest_po.iloc[0]
                        DBClient.execute_stmt("""
                            UPDATE in_po_final
                            SET po_quantity = :quantity,
                                po_note = :note,
                                po_seq = :seq
                            WHERE po_num = :po_num
                              AND po_sku = :po_sku
                        """, {
                            'po_num': po_num,
                            'po_sku': po_sku,
                            'quantity': int(lp['po_quantity']) if lp['po_quantity'] else 0,
                            'note': lp['note'] or '',
                            'seq': lp['seq'] or ''
                        })
                
                deleted_count += 1
        
        # 审计日志
        audit_logger.warning(f"删除异常处理: {logistic_num}", extra={
            "user": operator,
            "func": "Purchase:AbnormalDelete",
            "action": "DELETE_ABNORMAL",
            "target": f"{logistic_num}|{receive_date}|{deleted_count}条"
        })
        
        return JsonResponse({
            'success': True,
            'message': f'已删除 {deleted_count} 条处理记录'
        })
        
    except Exception as e:
        logger.exception("删除异常处理失败")
        return JsonResponse({
            'success': False,
            'message': f'删除失败: {str(e)}'
        }, status=500)
