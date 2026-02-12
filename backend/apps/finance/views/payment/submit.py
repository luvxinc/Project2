# File: backend/apps/finance/views/payment/submit.py
"""
物流付款 - 提交与删除付款 API
"""
import json
import logging
from datetime import date as date_type

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.utils.translation import gettext as _

from core.components.db.client import DBClient
from core.services.security.policy_manager import SecurityPolicyManager

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_POST
def submit_payment_api(request):
    """
    提交物流付款
    URL: POST /dashboard/finance/logistic/api/submit_payment/
    
    请求参数:
        logistic_nums: list, 物流单号列表
        payment_date: str, 付款日期 YYYY-MM-DD
        use_payment_date_rate: bool, 是否使用付款日汇率
        settlement_rate: float, 结算汇率（仅当 use_payment_date_rate=True）
        rate_source: str, 汇率来源 'auto' 或 'manual'
        extra_fee: {note, currency, amount}, 额外费用（可选）
        passwords: {l0: xxx}, 安全验证密码
    
    数据库写入:
        1. in_send（仅当 use_payment_date_rate=True）
        2. in_pmt_logistic
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('数据格式错误')}, status=400)
    
    # 安全验证
    from apps.purchase.utils import inject_security_codes_to_post
    inject_security_codes_to_post(request, data)
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'logistic_payment_confirm')
    if not is_valid:
        return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
    
    # 提取参数
    logistic_nums = data.get('logistic_nums', [])
    payment_date = data.get('payment_date', '')
    use_payment_date_rate = data.get('use_payment_date_rate', False)
    settlement_rate = float(data.get('settlement_rate', 0)) if data.get('settlement_rate') else 0
    rate_source = data.get('rate_source', 'original')  # auto, manual, original
    extra_fee = data.get('extra_fee', None)
    
    if not logistic_nums:
        return JsonResponse({'success': False, 'message': _('未选择物流单')}, status=400)
    
    if not payment_date:
        return JsonResponse({'success': False, 'message': _('付款日期不能为空')}, status=400)
    
    today = date_type.today().isoformat()
    username = request.user.username
    
    try:
        # ========== 生成 pmt_no ==========
        # 格式: {payment_date}_S## (从01开始递增)
        pmt_no_df = DBClient.read_df("""
            SELECT pmt_no FROM in_pmt_logistic
            WHERE pmt_no LIKE :prefix
            ORDER BY pmt_no DESC
            LIMIT 1
        """, {'prefix': f"{payment_date}_S%"})
        
        if pmt_no_df.empty or not pmt_no_df.iloc[0]['pmt_no']:
            pmt_no = f"{payment_date}_S01"
        else:
            last_pmt_no = pmt_no_df.iloc[0]['pmt_no']
            # 提取序号部分并+1
            try:
                last_seq = int(last_pmt_no.split('_S')[-1])
                pmt_no = f"{payment_date}_S{str(last_seq + 1).zfill(2)}"
            except (ValueError, IndexError):
                pmt_no = f"{payment_date}_S01"
        
        logger.info(f"[LogisticPayment] Generated pmt_no: {pmt_no}")
        
        success_count = 0
        
        # P0-3: 使用事务保护批量操作
        with DBClient.atomic_transaction():
            for logistic_num in logistic_nums:
                # 获取当前物流单最大 seq 的信息
                send_df = DBClient.read_df("""
                    SELECT date_sent, date_eta, pallets, price_kg, total_weight, 
                           total_price, usd_rmb, mode, note, seq,
                           CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
                    FROM in_send
                    WHERE logistic_num = :logistic_num
                    ORDER BY seq_num DESC
                    LIMIT 1
                """, {'logistic_num': logistic_num})
                
                if send_df.empty:
                    logger.warning(f"物流单 {logistic_num} 不存在")
                    continue
                
                row = send_df.iloc[0]
                date_sent = str(row['date_sent']) if row['date_sent'] else today
                total_price = float(row['total_price']) if row['total_price'] else 0.0
                
                # ========== 2. 写入 in_pmt_logistic ==========
                # 获取该物流单号的最大 seq（判断是否已有付款记录）
                payment_seq_df = DBClient.read_df("""
                    SELECT MAX(CAST(REPLACE(seq, 'V', '') AS UNSIGNED)) as max_num
                    FROM in_pmt_logistic
                    WHERE logistic_num = :logistic_num
                """, {'logistic_num': logistic_num})
                
                payment_max_seq = int(payment_seq_df.iloc[0]['max_num']) if not payment_seq_df.empty and payment_seq_df.iloc[0]['max_num'] else 0
                new_payment_seq = f"V{str(payment_max_seq + 1).zfill(2)}"
                
                # 如果已有付款记录（max_seq > 0），则使用 adjust，否则使用 new
                log_ops = 'adjust' if payment_max_seq > 0 else 'new'
                
                extra_paid = 0.0
                extra_currency = ''
                extra_note = ''
                
                if extra_fee:
                    extra_paid = float(extra_fee.get('amount', 0)) if extra_fee.get('amount') else 0.0
                    extra_currency = extra_fee.get('currency', '')
                    extra_note = extra_fee.get('note', '')
                
                # 确定汇率和汇率来源
                if use_payment_date_rate and settlement_rate > 0:
                    final_rate = settlement_rate
                    final_mode = 'A' if rate_source == 'auto' else 'M'
                else:
                    # 使用原始汇率
                    final_rate = float(row['usd_rmb']) if row['usd_rmb'] else 7.25
                    final_mode = row['mode'] if row['mode'] else 'M'
                
                DBClient.execute_stmt("""
                    INSERT INTO in_pmt_logistic 
                    (date_record, date_sent, logistic_num, logistic_paid, 
                     extra_paid, extra_currency, extra_note, payment_date, note, seq, by_user, pmt_no,
                     usd_rmb, mode, log_ops)
                    VALUES 
                    (:date_record, :date_sent, :logistic_num, :logistic_paid,
                     :extra_paid, :extra_currency, :extra_note, :payment_date, :note, :seq, :by_user, :pmt_no,
                     :usd_rmb, :mode, :log_ops)
                """, {
                    'date_record': today,
                    'date_sent': date_sent,
                    'logistic_num': logistic_num,
                    'logistic_paid': total_price,
                    'extra_paid': extra_paid,
                    'extra_currency': extra_currency,
                    'extra_note': extra_note,
                    'payment_date': payment_date,
                    'note': '原始发货单付款',
                    'seq': new_payment_seq,
                    'by_user': username,
                    'pmt_no': pmt_no,
                    'usd_rmb': final_rate,
                    'mode': final_mode,
                    'log_ops': log_ops
                })
                
                success_count += 1
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"物流批量付款: {success_count}单", extra={
            "user": username,
            "func": "Finance:LogisticPayment",
            "action": "BATCH_PAYMENT",
            "target": ','.join(logistic_nums[:5])  # 最多记录5个单号
        })
        
        # 更新 FIFO 入库单价记录
        from apps.finance.utils.landed_price import recalculate_landed_prices
        for logistic_num in logistic_nums:
            try:
                recalculate_landed_prices(logistic_num=logistic_num)
            except Exception as price_err:
                logger.warning(f"更新入库单价记录失败 ({logistic_num}): {price_err}")
        
        return JsonResponse({
            'success': True,
            'message': _('成功处理 {count} 单付款').format(count=success_count),
            'data': {
                'success_count': success_count,
                'total_count': len(logistic_nums)
            }
        })
        
    except Exception as e:
        logger.exception("付款处理失败")
        return JsonResponse({'success': False, 'message': _('处理失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def delete_payment_api(request):
    """
    删除付款记录
    逻辑：复制 in_pmt_logistic 当前行，logistic_paid/extra_paid/extra_currency/extra_note 清空，
    note 改为 '删除订单'，seq+1，log_ops='adjust'，date_record=今天
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('数据格式错误')}, status=400)
    
    from apps.purchase.utils import inject_security_codes_to_post
    inject_security_codes_to_post(request, data)
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'logistic_payment_delete')
    if not is_valid:
        return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
    
    pmt_no = data.get('pmt_no', '')
    if not pmt_no:
        return JsonResponse({'success': False, 'message': _('付款序列号不能为空')}, status=400)
    
    today = date_type.today().isoformat()
    username = request.user.username
    
    try:
        # 计算要删除的记录数
        count_df = DBClient.read_df("""
            SELECT COUNT(DISTINCT logistic_num) as cnt
            FROM in_pmt_logistic 
            WHERE pmt_no = :pmt_no
        """, {'pmt_no': pmt_no})
        
        count = int(count_df.iloc[0]['cnt']) if not count_df.empty else 0
        
        if count == 0:
            return JsonResponse({'success': False, 'message': _('未找到付款记录: {pmt_no}').format(pmt_no=pmt_no)}, status=404)
        
        # 直接删除该 pmt_no 的所有记录（触发器会自动删除 final 表）
        DBClient.execute_stmt("""
            DELETE FROM in_pmt_logistic WHERE pmt_no = :pmt_no
        """, {'pmt_no': pmt_no})
        
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"删除物流付款: {pmt_no}, {count}单", extra={
            "user": username,
            "func": "Finance:LogisticPayment",
            "action": "DELETE_PAYMENT",
            "target": pmt_no
        })
        
        # 获取受影响的物流单号并更新 FIFO 入库单价记录
        logistic_df = DBClient.read_df("""
            SELECT DISTINCT logistic_num FROM in_pmt_logistic WHERE pmt_no = :pmt_no
        """, {'pmt_no': pmt_no})
        
        if not logistic_df.empty:
            from apps.finance.utils.landed_price import recalculate_landed_prices
            for logistic_num in logistic_df['logistic_num'].tolist():
                try:
                    recalculate_landed_prices(logistic_num=logistic_num)
                except Exception as price_err:
                    logger.warning(f"更新入库单价记录失败 ({logistic_num}): {price_err}")
        
        return JsonResponse({
            'success': True,
            'message': _('成功删除付款记录 {pmt_no}，共 {count} 单').format(pmt_no=pmt_no, count=count),
            'data': {'pmt_no': pmt_no, 'affected_count': count}
        })
        
    except Exception as e:
        logger.exception("删除付款失败")
        return JsonResponse({'success': False, 'message': _('删除失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def restore_payment_api(request):
    """
    恢复已删除的付款记录
    逻辑：找到删除行(note='删除订单')的seq，通过seq-1找到删除前的数据，
    复制此行，date_record=今天，seq=删除行seq+1，note='恢复删除'，log_ops='adjust'
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('数据格式错误')}, status=400)
    
    from apps.purchase.utils import inject_security_codes_to_post
    inject_security_codes_to_post(request, data)
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'logistic_payment_delete')
    if not is_valid:
        return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
    
    pmt_no = data.get('pmt_no', '')
    if not pmt_no:
        return JsonResponse({'success': False, 'message': _('付款序列号不能为空')}, status=400)
    
    today = date_type.today().isoformat()
    username = request.user.username
    
    try:
        # 获取该 pmt_no 每个物流单号的最新记录（应该是删除记录）
        deleted_df = DBClient.read_df("""
            SELECT p.* FROM in_pmt_logistic p
            INNER JOIN (
                SELECT logistic_num, MAX(CAST(REPLACE(seq, 'V', '') AS UNSIGNED)) as max_seq
                FROM in_pmt_logistic WHERE pmt_no = :pmt_no
                GROUP BY logistic_num
            ) m ON p.logistic_num = m.logistic_num 
                AND CAST(REPLACE(p.seq, 'V', '') AS UNSIGNED) = m.max_seq
            WHERE p.pmt_no = :pmt_no AND p.note = '删除订单'
        """, {'pmt_no': pmt_no})
        
        if deleted_df.empty:
            return JsonResponse({'success': False, 'message': _('未找到可恢复的删除记录: {pmt_no}').format(pmt_no=pmt_no)}, status=404)
        
        success_count = 0
        
        for _idx, del_row in deleted_df.iterrows():
            logistic_num = del_row['logistic_num']
            del_seq = del_row['seq']
            del_seq_num = int(del_seq.replace('V', ''))
            prev_seq_num = del_seq_num - 1
            prev_seq = f"V{str(prev_seq_num).zfill(2)}"
            
            # 查找删除前的数据
            prev_df = DBClient.read_df("""
                SELECT * FROM in_pmt_logistic
                WHERE pmt_no = :pmt_no AND logistic_num = :logistic_num AND seq = :prev_seq
            """, {'pmt_no': pmt_no, 'logistic_num': logistic_num, 'prev_seq': prev_seq})
            
            if prev_df.empty:
                logger.warning(f"无法找到 {logistic_num} 删除前的版本 {prev_seq}")
                continue
            
            prev_row = prev_df.iloc[0]
            new_seq = f"V{str(del_seq_num + 1).zfill(2)}"
            
            # 插入恢复记录
            DBClient.execute_stmt("""
                INSERT INTO in_pmt_logistic 
                (date_record, date_sent, logistic_num, logistic_paid, 
                 extra_paid, extra_currency, extra_note, payment_date, note, seq, by_user, pmt_no,
                 usd_rmb, mode, log_ops)
                VALUES 
                (:date_record, :date_sent, :logistic_num, :logistic_paid,
                 :extra_paid, :extra_currency, :extra_note, :payment_date, :note, :seq, :by_user, :pmt_no,
                 :usd_rmb, :mode, 'adjust')
            """, {
                'date_record': today,
                'date_sent': prev_row['date_sent'],
                'logistic_num': logistic_num,
                'logistic_paid': prev_row['logistic_paid'],
                'extra_paid': prev_row.get('extra_paid'),
                'extra_currency': prev_row.get('extra_currency'),
                'extra_note': prev_row.get('extra_note'),
                'payment_date': prev_row['payment_date'],
                'note': '恢复删除',
                'seq': new_seq,
                'by_user': username,
                'pmt_no': pmt_no,
                'usd_rmb': prev_row.get('usd_rmb') or 7.25,
                'mode': prev_row.get('mode') or 'M'
            })
            
            success_count += 1
        
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"恢复物流付款: {pmt_no}, {success_count}单", extra={
            "user": username,
            "func": "Finance:LogisticPayment",
            "action": "RESTORE_PAYMENT",
            "target": pmt_no
        })
        
        return JsonResponse({
            'success': True,
            'message': _('成功恢复付款记录 {pmt_no}，共 {count} 单').format(pmt_no=pmt_no, count=success_count),
            'data': {'pmt_no': pmt_no, 'affected_count': success_count}
        })
        
    except Exception as e:
        logger.exception("恢复付款失败")
        return JsonResponse({'success': False, 'message': _('恢复失败: {error}').format(error=str(e))}, status=500)

