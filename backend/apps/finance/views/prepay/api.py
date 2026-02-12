# File: backend/apps/finance/views/prepay/api.py
"""
厂商预付款管理 - API 接口
"""
import json
from decimal import Decimal
from datetime import datetime, timedelta
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.utils.translation import gettext as _

from core.components.db.client import DBClient
from core.services.security.policy_manager import SecurityPolicyManager
from backend.common.settings import settings


@login_required(login_url='web_ui:login')
@require_GET
def supplier_balance_api(request):
    """
    获取所有供应商的预付款余额
    
    计算规则:
    1. 读取 in_supplier 获取所有供应商
    2. 读取 in_supplier_strategy 获取每个供应商最新的结算货币
    3. 读取 in_pmt_prepay_final 计算该供应商的余额:
       - tran_type='in' 时加金额
       - tran_type='out' 时减金额
       - 若 tran_curr_use != supplier_currency，需用 usd_rmb 转换
    """
    try:
        # Step 1: 获取所有供应商
        suppliers_sql = '''
            SELECT supplier_code, supplier_name 
            FROM in_supplier 
            ORDER BY supplier_code
        '''
        suppliers_df = DBClient.read_df(suppliers_sql)
        
        if suppliers_df.empty:
            return JsonResponse({'success': True, 'data': []})
        
        # Step 2: 获取每个供应商最新的结算货币
        strategy_sql = '''
            SELECT s.supplier_code, s.currency
            FROM in_supplier_strategy s
            INNER JOIN (
                SELECT supplier_code, MAX(effective_date) as max_date
                FROM in_supplier_strategy
                GROUP BY supplier_code
            ) latest ON s.supplier_code = latest.supplier_code 
                AND s.effective_date = latest.max_date
        '''
        strategy_df = DBClient.read_df(strategy_sql)
        
        # 构建 supplier_code -> currency 映射
        currency_map = {}
        for _idx, row in strategy_df.iterrows():
            currency_map[row['supplier_code']] = row['currency']
        
        # Step 3: 获取所有预付款交易记录
        # 注意：in_pmt_prepay_final 是快照表，删除的记录会被从表中移除，无需过滤
        prepay_sql = '''
            SELECT supplier_code, tran_curr_use, tran_amount, tran_type, usd_rmb
            FROM in_pmt_prepay_final
        '''
        prepay_df = DBClient.read_df(prepay_sql)
        
        # Step 4: 计算每个供应商的余额
        result = []
        for _idx, supplier in suppliers_df.iterrows():
            code = supplier['supplier_code']
            name = supplier['supplier_name']
            supplier_currency = currency_map.get(code, 'RMB')  # 默认 RMB
            
            # 筛选该供应商的交易
            supplier_txns = prepay_df[prepay_df['supplier_code'] == code]
            
            balance = Decimal('0.00')
            for _idx, txn in supplier_txns.iterrows():
                amount = Decimal(str(txn['tran_amount']))
                curr_use = txn['tran_curr_use']
                tran_type = txn['tran_type']
                usd_rmb = Decimal(str(txn['usd_rmb']))
                
                # 货币转换
                if curr_use != supplier_currency:
                    # 需要转换
                    if supplier_currency == 'RMB':
                        # curr_use 是 USD，转换为 RMB
                        converted = amount * usd_rmb
                    else:
                        # curr_use 是 RMB，转换为 USD
                        converted = amount / usd_rmb if usd_rmb > 0 else amount
                else:
                    converted = amount
                
                # 根据 tran_type 加减
                if tran_type == 'in':
                    balance += converted
                else:  # out
                    balance -= converted
            
            result.append({
                'supplier_code': code,
                'supplier_name': name,
                'currency': supplier_currency,
                'balance': float(round(balance, 5)),
            })
        
        return JsonResponse({'success': True, 'data': result})
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def transaction_list_api(request):
    """
    获取指定供应商的交易明细
    
    Query Params:
    - supplier_code: 供应商代码 (必填)
    - date_from: 开始日期 YYYY-MM-DD (可选)
    - date_to: 结束日期 YYYY-MM-DD (可选)
    - preset: 预设区间 6m/1y/2y (可选)
    """
    try:
        supplier_code = request.GET.get('supplier_code', '').strip()
        if not supplier_code:
            return JsonResponse({'success': False, 'error': _('缺少 supplier_code')}, status=400)
        
        # 日期范围处理
        date_from = request.GET.get('date_from', '').strip()
        date_to = request.GET.get('date_to', '').strip()
        preset = request.GET.get('preset', '').strip()
        
        today = datetime.now().date()
        
        if preset == '6m':
            date_from = (today - timedelta(days=180)).strftime('%Y-%m-%d')
            date_to = today.strftime('%Y-%m-%d')
        elif preset == '1y':
            date_from = (today - timedelta(days=365)).strftime('%Y-%m-%d')
            date_to = today.strftime('%Y-%m-%d')
        elif preset == '2y':
            date_from = (today - timedelta(days=730)).strftime('%Y-%m-%d')
            date_to = today.strftime('%Y-%m-%d')
        
        # Step 1: 获取供应商信息
        supplier_sql = '''
            SELECT supplier_code, supplier_name 
            FROM in_supplier 
            WHERE supplier_code = :code
        '''
        supplier_df = DBClient.read_df(supplier_sql, {'code': supplier_code})
        if supplier_df.empty:
            return JsonResponse({'success': False, 'error': _('供应商不存在')}, status=404)
        
        supplier_name = supplier_df.iloc[0]['supplier_name']
        
        # Step 2: 获取供应商结算货币
        currency_sql = '''
            SELECT currency 
            FROM in_supplier_strategy 
            WHERE supplier_code = :code 
            ORDER BY effective_date DESC 
            LIMIT 1
        '''
        currency_df = DBClient.read_df(currency_sql, {'code': supplier_code})
        supplier_currency = currency_df.iloc[0]['currency'] if not currency_df.empty else 'RMB'
        
        # Step 3: 构建查询 - 所有交易用于计算 beginning balance
        # 注意：in_pmt_prepay_final 是快照表，没有 tran_ops 列，删除的记录已被移除
        all_txn_sql = '''
            SELECT tran_num, tran_date, tran_curr_req, tran_curr_use, 
                   tran_amount, tran_type, usd_rmb, tran_curr_type,
                   tran_seq, tran_by, tran_note
            FROM in_pmt_prepay_final
            WHERE supplier_code = :code
            ORDER BY tran_date ASC, tran_num ASC
        '''
        all_txn_df = DBClient.read_df(all_txn_sql, {'code': supplier_code})
        
        # Step 4: 计算筛选前的 beginning balance
        beginning_balance = Decimal('0.00')
        filtered_txns = []
        
        for _idx, txn in all_txn_df.iterrows():
            txn_date = txn['tran_date']
            if isinstance(txn_date, str):
                txn_date_str = txn_date
            else:
                txn_date_str = txn_date.strftime('%Y-%m-%d')
            
            # 判断是否在筛选范围之前
            in_filter_range = True
            if date_from and txn_date_str < date_from:
                in_filter_range = False
            if date_to and txn_date_str > date_to:
                in_filter_range = False
            
            amount = Decimal(str(txn['tran_amount']))
            curr_use = txn['tran_curr_use']
            tran_type = txn['tran_type']
            usd_rmb = Decimal(str(txn['usd_rmb']))
            
            # 转换到供应商结算货币
            if curr_use != supplier_currency:
                if supplier_currency == 'RMB':
                    converted = amount * usd_rmb
                else:
                    converted = amount / usd_rmb if usd_rmb > 0 else amount
            else:
                converted = amount
            
            # 快照表中的记录都是有效的（删除的已被移除）
            if not in_filter_range and date_from and txn_date_str < date_from:
                # 筛选前的交易，累加到 beginning balance
                if tran_type == 'in':
                    beginning_balance += converted
                else:
                    beginning_balance -= converted
            elif in_filter_range:
                # 检查是否有文件
                has_file = False
                if tran_type == 'in':
                    try:
                        year = txn_date_str[:4]
                        file_dir = settings.RECORDS_DIR / 'finance' / 'prepay' / year / txn['tran_num']
                        if file_dir.exists() and any(file_dir.iterdir()):
                            has_file = True
                    except:
                        pass
                
                # 在筛选范围内
                # 判断是否已删除（tran_amount=0 表示已删除）
                is_deleted = (float(amount) == 0)
                
                filtered_txns.append({
                    'tran_num': txn['tran_num'],
                    'tran_date': txn_date_str,
                    'tran_curr_req': txn['tran_curr_req'],
                    'tran_curr_use': txn['tran_curr_use'],
                    'tran_amount': float(amount),
                    'tran_type': tran_type,
                    'usd_rmb': float(txn['usd_rmb']),
                    'tran_curr_type': txn.get('tran_curr_type', 'A'),
                    'tran_seq': txn['tran_seq'],
                    'tran_by': txn['tran_by'],
                    'tran_note': txn['tran_note'] or '',
                    'converted_amount': float(round(converted, 5)),
                    'has_file': has_file,
                    'is_deleted': is_deleted,
                })
        
        # Step 5: 计算每行的累计余额
        running_balance = beginning_balance
        for txn in filtered_txns:
            # 已删除的记录不参与余额计算
            if txn.get('is_deleted'):
                txn['running_balance'] = float(round(running_balance, 5))
            else:
                if txn['tran_type'] == 'in':
                    running_balance += Decimal(str(txn['converted_amount']))
                else:
                    running_balance -= Decimal(str(txn['converted_amount']))
                txn['running_balance'] = float(round(running_balance, 5))
        
        return JsonResponse({
            'success': True,
            'data': {
                'supplier_code': supplier_code,
                'supplier_name': supplier_name,
                'supplier_currency': supplier_currency,
                'beginning_balance': float(round(beginning_balance, 5)),
                'transactions': filtered_txns,
                'filter': {
                    'date_from': date_from or None,
                    'date_to': date_to or None,
                }
            }
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def submit_prepay_api(request):
    """
    提交预付款记录
    
    支持 FormData 或 JSON 格式:
    - supplier_code: 供应商代码
    - tran_date: 预付款日期 YYYY-MM-DD
    - tran_curr_req: 供应商结算货币
    - tran_curr_use: 实际付款货币
    - usd_rmb: 汇率
    - tran_curr_type: 汇率来源 A/M
    - tran_amount: 金额
    - tran_note: 备注
    - file: 付款文件（可选）
    """
    try:
        # 安全验证：检查密码策略
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_prepay_submit')
        if not is_valid:
            return JsonResponse({'success': False, 'error': msg or _('密码验证失败')}, status=403)
        
        # 判断请求格式（FormData 或 JSON）
        content_type = request.content_type or ''
        if 'multipart/form-data' in content_type:
            # FormData 格式
            supplier_code = request.POST.get('supplier_code', '').strip()
            tran_date = request.POST.get('tran_date', '').strip()
            tran_curr_req = request.POST.get('tran_curr_req', '').strip()
            tran_curr_use = request.POST.get('tran_curr_use', '').strip()
            usd_rmb = Decimal(str(request.POST.get('usd_rmb', 0)))
            tran_curr_type = request.POST.get('tran_curr_type', 'M').strip()
            tran_amount = Decimal(str(request.POST.get('tran_amount', 0)))
            tran_note = request.POST.get('tran_note', '').strip()
            uploaded_file = request.FILES.get('file')
        else:
            # JSON 格式（向后兼容）
            data = json.loads(request.body)
            supplier_code = data.get('supplier_code', '').strip()
            tran_date = data.get('tran_date', '').strip()
            tran_curr_req = data.get('tran_curr_req', '').strip()
            tran_curr_use = data.get('tran_curr_use', '').strip()
            usd_rmb = Decimal(str(data.get('usd_rmb', 0)))
            tran_curr_type = data.get('tran_curr_type', 'M').strip()
            tran_amount = Decimal(str(data.get('tran_amount', 0)))
            tran_note = data.get('tran_note', '').strip()
            uploaded_file = None
        
        # 验证必填字段
        if not all([supplier_code, tran_date, tran_curr_req, tran_curr_use, tran_note]):
            return JsonResponse({'success': False, 'error': _('缺少必填字段')}, status=400)
        
        if usd_rmb <= 0:
            return JsonResponse({'success': False, 'error': _('汇率必须大于0')}, status=400)
        
        if tran_amount <= 0:
            return JsonResponse({'success': False, 'error': _('金额必须大于0')}, status=400)
        
        # 生成流水号: {supplier_code}_{YYYYMMDD}_in_##
        date_str = tran_date.replace('-', '')
        
        # 查询当天该供应商的最大流水号
        seq_sql = '''
            SELECT tran_num FROM in_pmt_prepay
            WHERE supplier_code = :code AND tran_date = :date AND tran_type = 'in'
            ORDER BY tran_num DESC LIMIT 1
        '''
        seq_df = DBClient.read_df(seq_sql, {'code': supplier_code, 'date': tran_date})
        
        if seq_df.empty:
            seq_num = 1
        else:
            # 解析最后一个流水号的序号
            last_num = seq_df.iloc[0]['tran_num']
            try:
                seq_num = int(last_num.split('_')[-1]) + 1
            except:
                seq_num = 1
        
        tran_num = f"{supplier_code}_{date_str}_in_{seq_num:02d}"
        
        # 操作人
        tran_by = request.user.username if request.user.is_authenticated else 'system'
        
        # 写入 in_pmt_prepay 表 (触发器会自动同步到 in_pmt_prepay_final)
        insert_sql = '''
            INSERT INTO in_pmt_prepay (
                tran_num, supplier_code, tran_date, tran_curr_req, tran_curr_use,
                usd_rmb, tran_curr_type, tran_amount, tran_type, tran_ops, tran_seq, tran_by, tran_note
            ) VALUES (
                :tran_num, :supplier_code, :tran_date, :tran_curr_req, :tran_curr_use,
                :usd_rmb, :tran_curr_type, :tran_amount, 'in', 'new', 'T01', :tran_by, :tran_note
            )
        '''
        
        DBClient.execute_stmt(insert_sql, {
            'tran_num': tran_num,
            'supplier_code': supplier_code,
            'tran_date': tran_date,
            'tran_curr_req': tran_curr_req,
            'tran_curr_use': tran_curr_use,
            'usd_rmb': float(usd_rmb),
            'tran_curr_type': tran_curr_type,
            'tran_amount': float(tran_amount),
            'tran_by': tran_by,
            'tran_note': tran_note
        })
        
        # 如果有文件上传，保存文件
        file_saved = False
        if uploaded_file:
            try:
                from backend.common.settings import settings
                import os
                
                # 解析年份
                year = tran_date[:4]
                
                # 构建存储目录: data/records/finance/prepay/{YYYY}/{tran_num}/
                prepay_dir = settings.RECORDS_DIR / 'finance' / 'prepay' / year / tran_num
                prepay_dir.mkdir(parents=True, exist_ok=True)
                
                # 获取文件扩展名
                ext = os.path.splitext(uploaded_file.name)[1].lower()
                
                # 构建文件名: {tran_num}_V01.{ext}
                filename = f"{tran_num}_V01{ext}"
                file_path = prepay_dir / filename
                
                # 保存文件
                with open(file_path, 'wb+') as f:
                    for chunk in uploaded_file.chunks():
                        f.write(chunk)
                
                file_saved = True
            except Exception as file_err:
                # 文件保存失败不影响主流程，仅记录日志
                import logging
                logging.error(f"[Prepay] 文件保存失败: {file_err}")
        
        return JsonResponse({
            'success': True,
            'tran_num': tran_num,
            'file_saved': file_saved,
            'message': _('预付款记录已成功添加')
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': _('无效的请求格式')}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def prepay_history_api(request):
    """
    获取预付款历史修订记录（三栏布局）
    
    Query params:
    - tran_num: 流水号
    
    Returns:
    - supplier_strategy_versions: 左栏 - 厂商策略修改（来自 in_supplier_strategy）
    - prepay_rate_versions: 中栏 - 汇率/货币修改（来自 in_pmt_prepay）
    - amount_versions: 右栏 - 金额修改
    """
    try:
        tran_num = request.GET.get('tran_num', '').strip()
        
        if not tran_num:
            return JsonResponse({'success': False, 'error': _(_('缺少流水号参数'))}, status=400)
        
        # 解析供应商代码
        supplier_code = tran_num.split('_')[0] if '_' in tran_num else ''
        
        # 1. 查询预付款记录（用于金额和汇率/货币变更）
        history_sql = '''
            SELECT tran_num, tran_date, tran_curr_req, tran_curr_use, 
                   tran_amount, tran_type, usd_rmb, tran_curr_type,
                   tran_ops, tran_seq, tran_by, tran_note, created_at as tran_time
            FROM in_pmt_prepay
            WHERE tran_num = :tran_num
            ORDER BY tran_seq ASC
        '''
        history_df = DBClient.read_df(history_sql, {'tran_num': tran_num})
        
        # 2. 查询供应商策略历史（货币变更）
        strategy_sql = '''
            SELECT effective_date, currency, note, `by`, created_at
            FROM in_supplier_strategy
            WHERE supplier_code = :supplier_code
            ORDER BY effective_date ASC, id ASC
        '''
        strategy_df = DBClient.read_df(strategy_sql, {'supplier_code': supplier_code})
        
        # ========== 左栏：厂商策略修改（来自 in_supplier_strategy）==========
        supplier_strategy_versions = []
        prev_strat = None
        for i, (idx, row) in enumerate(strategy_df.iterrows()):
            eff_date = row['effective_date']
            eff_date_str = eff_date.strftime('%Y-%m-%d') if hasattr(eff_date, 'strftime') else str(eff_date)
            created_at = row.get('created_at')
            created_str = created_at.strftime('%Y-%m-%d %H:%M:%S') if hasattr(created_at, 'strftime') else str(created_at) if created_at else ''
            
            is_first = (i == 0)
            
            version = {
                'seq': f"S{i+1}",
                'date': created_str or eff_date_str,
                'by': row.get('by') or '-',
                'note': row.get('note') or '',
                'is_initial': is_first,
                'effective_date': eff_date_str,
                'changes': []
            }
            
            if is_first:
                version['currency'] = row['currency']
            else:
                if prev_strat is not None and row['currency'] != prev_strat['currency']:
                    version['changes'].append({
                        'field': _('厂商要求货币'),
                        'old': prev_strat['currency'],
                        'new': row['currency']
                    })
            
            prev_strat = row
            # 只有有变更或是初始版本时才添加
            if is_first or version['changes']:
                supplier_strategy_versions.append(version)
        
        # ========== 中栏：汇率/货币修改（来自 in_pmt_prepay）==========
        prepay_rate_versions = []
        prev_row = None
        for i, (idx, row) in enumerate(history_df.iterrows()):
            tran_time = row.get('tran_time')
            if tran_time:
                tran_time_str = tran_time.strftime('%Y-%m-%d %H:%M:%S') if hasattr(tran_time, 'strftime') else str(tran_time)
            else:
                tran_time_str = ''
            
            is_first = (i == 0)
            
            # Safe float conversion
            try:
                raw_rate = row['usd_rmb']
                import math
                rate_val = float(raw_rate) if raw_rate is not None else 0.0
                if math.isnan(rate_val):
                    rate_val = 0.0
            except:
                rate_val = 0.0
                
            version = {
                'seq': row['tran_seq'],
                'date': tran_time_str,
                'by': row['tran_by'] or '-',
                'note': row['tran_note'] or '',
                'is_initial': is_first,
                'usd_rmb': rate_val,
                'tran_curr_use': row['tran_curr_use'],
                'changes': []
            }
            
            # 非首条记录：对比变更
            if not is_first and prev_row is not None:
                try:
                    prev_raw = prev_row['usd_rmb']
                    prev_val = float(prev_raw) if prev_raw is not None else 0.0
                    if math.isnan(prev_val): prev_val = 0.0
                except:
                    prev_val = 0.0

                if abs(rate_val - prev_val) > 0.000001:
                    version['changes'].append({
                        'field': _('汇率'),
                        'old': f"{prev_val:.4f}",
                        'new': f"{rate_val:.4f}"
                    })
                if row['tran_curr_use'] != prev_row['tran_curr_use']:
                    version['changes'].append({
                        'field': _('操作货币'),
                        'old': prev_row['tran_curr_use'],
                        'new': row['tran_curr_use']
                    })
            
            prev_row = row
            prepay_rate_versions.append(version)
        
        # ========== 右栏：金额修改 ==========
        amount_versions = []
        prev_amount = None
        prev_currency = None
        prev_usd_rmb = None
        for i, (idx, row) in enumerate(history_df.iterrows()):
            tran_time = row.get('tran_time')
            if tran_time:
                tran_time_str = tran_time.strftime('%Y-%m-%d %H:%M:%S') if hasattr(tran_time, 'strftime') else str(tran_time)
            else:
                tran_time_str = ''
            
            current_currency = row['tran_curr_use']
            current_usd_rmb = float(row['usd_rmb'])
            current_amount = float(row['tran_amount'])
            
            # 计算 USD 金额（如果是 RMB，则折算）
            if current_currency == 'RMB':
                usd_amount = current_amount / current_usd_rmb if current_usd_rmb > 0 else 0
            else:
                usd_amount = current_amount
            
            is_first = (i == 0)
            
            version = {
                'seq': row['tran_seq'],
                'date': tran_time_str,
                'by': row['tran_by'] or '-',
                'note': row['tran_note'] or '',
                'is_initial': is_first,
                'tran_ops': row['tran_ops'],
                'currency': current_currency,
                'usd_rmb': current_usd_rmb,
                'changes': []
            }
            
            if is_first:
                version['amount'] = current_amount
                version['usd_amount'] = usd_amount
            else:
                if prev_amount is not None and current_amount != prev_amount:
                    # 计算旧的 USD 金额
                    if prev_currency == 'RMB':
                        prev_usd_amount = prev_amount / prev_usd_rmb if prev_usd_rmb and prev_usd_rmb > 0 else 0
                    else:
                        prev_usd_amount = prev_amount
                    
                    version['changes'].append({
                        'field': _('付款金额'),
                        'old': f"{prev_currency} {prev_amount:,.2f}",
                        'new': f"{current_currency} {current_amount:,.2f}",
                        'old_usd': prev_usd_amount,
                        'new_usd': usd_amount,
                        'old_currency': prev_currency,
                        'new_currency': current_currency
                    })
            
            prev_amount = current_amount
            prev_currency = current_currency
            prev_usd_rmb = current_usd_rmb
            amount_versions.append(version)
        
        return JsonResponse({
            'success': True,
            'data': {
                'tran_num': tran_num,
                'supplier_code': supplier_code,
                'supplier_strategy_versions': supplier_strategy_versions,
                'prepay_rate_versions': prepay_rate_versions,
                'amount_versions': amount_versions
            }
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def prepay_delete_api(request):
    """
    删除预付款记录（软删除：插入 tran_amount=0, tran_ops='adjust' 的记录）
    """
    try:
        data = json.loads(request.body)
        
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_prepay_delete')
        if not is_valid:
            return JsonResponse({'success': False, 'error': msg or _('密码验证失败')}, status=403)
        
        tran_num = data.get('tran_num', '').strip()
        if not tran_num:
            return JsonResponse({'success': False, 'error': _(_('缺少流水号参数'))}, status=400)
        
        # 查询最新版本
        latest_sql = '''
            SELECT * FROM in_pmt_prepay_final
            WHERE tran_num = :tran_num
        '''
        latest_df = DBClient.read_df(latest_sql, {'tran_num': tran_num})
        
        if latest_df.empty:
            return JsonResponse({'success': False, 'error': _('预付款记录不存在')}, status=404)
        
        latest = latest_df.iloc[0]
        
        # 检查是否已删除（tran_amount=0 表示已删除）
        if float(latest['tran_amount']) == 0:
            return JsonResponse({'success': False, 'error': _('该记录已被删除')}, status=400)
        
        # 获取下一个版本号
        current_seq = latest['tran_seq']
        seq_num = int(current_seq.replace('T', '')) + 1
        new_seq = f"T{seq_num:02d}"
        
        # 操作人
        tran_by = request.user.username if request.user.is_authenticated else 'system'
        
        # 插入删除记录：复制原行，tran_amount=0, tran_ops='adjust'
        delete_sql = '''
            INSERT INTO in_pmt_prepay (
                tran_num, supplier_code, tran_date, tran_curr_req, tran_curr_use,
                usd_rmb, tran_curr_type, tran_amount, tran_type, tran_ops, tran_seq, tran_by, tran_note
            ) VALUES (
                :tran_num, :supplier_code, :tran_date, :tran_curr_req, :tran_curr_use,
                :usd_rmb, :tran_curr_type, 0, :tran_type, 'adjust', :tran_seq, :tran_by, :tran_note
            )
        '''
        
        DBClient.execute_stmt(delete_sql, {
            'tran_num': tran_num,
            'supplier_code': latest['supplier_code'],
            'tran_date': str(latest['tran_date']),
            'tran_curr_req': latest['tran_curr_req'],
            'tran_curr_use': latest['tran_curr_use'],
            'usd_rmb': float(latest['usd_rmb']),
            'tran_curr_type': latest.get('tran_curr_type', 'A'),
            'tran_type': latest['tran_type'],
            'tran_seq': new_seq,
            'tran_by': tran_by,
            'tran_note': '删除付款'
        })
        
        return JsonResponse({
            'success': True,
            'message': _('预付款记录已删除')
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def prepay_restore_api(request):
    """
    恢复预付款记录（找到删除前版本，恢复金额）
    """
    try:
        data = json.loads(request.body)
        
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_prepay_undelete')
        if not is_valid:
            return JsonResponse({'success': False, 'error': msg or _('密码验证失败')}, status=403)
        
        tran_num = data.get('tran_num', '').strip()
        if not tran_num:
            return JsonResponse({'success': False, 'error': _(_('缺少流水号参数'))}, status=400)
        
        # 查询最新版本（应该是 tran_amount=0 的删除记录）
        latest_sql = '''
            SELECT * FROM in_pmt_prepay_final
            WHERE tran_num = :tran_num
        '''
        latest_df = DBClient.read_df(latest_sql, {'tran_num': tran_num})
        
        if latest_df.empty:
            return JsonResponse({'success': False, 'error': _('预付款记录不存在')}, status=404)
        
        latest = latest_df.iloc[0]
        
        # 检查是否已删除（tran_amount=0 表示已删除）
        if float(latest['tran_amount']) != 0:
            return JsonResponse({'success': False, 'error': _('该记录未被删除，无需恢复')}, status=400)
        
        # 获取删除行的 tran_seq，然后 seq-1 找到删除前的数据
        current_seq = latest['tran_seq']
        current_seq_num = int(current_seq.replace('T', ''))
        prev_seq_num = current_seq_num - 1
        prev_seq = f"T{prev_seq_num:02d}"
        
        # 查询删除前的版本
        prev_sql = '''
            SELECT * FROM in_pmt_prepay
            WHERE tran_num = :tran_num AND tran_seq = :prev_seq
        '''
        prev_df = DBClient.read_df(prev_sql, {'tran_num': tran_num, 'prev_seq': prev_seq})
        
        if prev_df.empty:
            return JsonResponse({'success': False, 'error': _('无法找到可恢复的版本')}, status=404)
        
        prev = prev_df.iloc[0]
        
        # 获取下一个版本号（删除行的 seq + 1）
        new_seq_num = current_seq_num + 1
        new_seq = f"T{new_seq_num:02d}"
        
        # 操作人
        tran_by = request.user.username if request.user.is_authenticated else 'system'
        
        # 插入恢复记录：复制删除前的行，tran_ops='adjust'
        restore_sql = '''
            INSERT INTO in_pmt_prepay (
                tran_num, supplier_code, tran_date, tran_curr_req, tran_curr_use,
                usd_rmb, tran_curr_type, tran_amount, tran_type, tran_ops, tran_seq, tran_by, tran_note
            ) VALUES (
                :tran_num, :supplier_code, :tran_date, :tran_curr_req, :tran_curr_use,
                :usd_rmb, :tran_curr_type, :tran_amount, :tran_type, 'adjust', :tran_seq, :tran_by, :tran_note
            )
        '''
        
        DBClient.execute_stmt(restore_sql, {
            'tran_num': tran_num,
            'supplier_code': prev['supplier_code'],
            'tran_date': str(prev['tran_date']),
            'tran_curr_req': prev['tran_curr_req'],
            'tran_curr_use': prev['tran_curr_use'],
            'usd_rmb': float(prev['usd_rmb']),
            'tran_curr_type': prev.get('tran_curr_type', 'A'),
            'tran_amount': float(prev['tran_amount']),
            'tran_type': prev['tran_type'],
            'tran_seq': new_seq,
            'tran_by': tran_by,
            'tran_note': '恢复删除'
        })
        
        return JsonResponse({
            'success': True,
            'message': _('预付款记录已恢复')
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')



@login_required(login_url='web_ui:login')
@require_GET
def prepay_file_info_api(request):
    """
    获取预付款文件信息
    """
    try:
        tran_num = request.GET.get('tran_num', '').strip()
        
        if not tran_num:
            return JsonResponse({'success': False, 'error': _('缺少流水号参数')}, status=400)
        
        # 解析年份（从流水号中提取）
        # 格式: XX_20260104_in_01
        parts = tran_num.split('_')
        if len(parts) >= 2:
            date_part = parts[1]
            year = date_part[:4] if len(date_part) >= 4 else str(datetime.now().year)
        else:
            year = str(datetime.now().year)
        
        # 构建目录路径
        file_dir = settings.RECORDS_DIR / 'finance' / 'prepay' / year / tran_num
        
        files = []
        has_file = False
        latest_file = None
        
        if file_dir.exists():
            for f in sorted(file_dir.iterdir(), reverse=True):
                if f.is_file():
                    files.append({
                        'name': f.name,
                        'size': f.stat().st_size,
                        'modified': f.stat().st_mtime,
                    })
                    if not latest_file:
                        latest_file = f.name
                        has_file = True
        
        return JsonResponse({
            'success': True,
            'data': {
                'tran_num': tran_num,
                'year': year,
                'has_file': has_file,
                'latest_file': latest_file,
                'files': files
            }
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def prepay_serve_file_api(request):
    """
    提供预付款文件下载
    """
    from django.http import FileResponse, HttpResponse
    import mimetypes
    import io
    
    try:
        tran_num = request.GET.get('tran_num', '').strip()
        filename = request.GET.get('filename', '').strip()
        
        if not tran_num or not filename:
            return JsonResponse({'success': False, 'error': _('缺少参数')}, status=400)
        
        # 解析年份
        parts = tran_num.split('_')
        if len(parts) >= 2:
            date_part = parts[1]
            year = date_part[:4] if len(date_part) >= 4 else str(datetime.now().year)
        else:
            year = str(datetime.now().year)
        
        # 构建文件路径
        file_path = settings.RECORDS_DIR / 'finance' / 'prepay' / year / tran_num / filename
        
        if not file_path.exists():
            return JsonResponse({'success': False, 'error': _('文件不存在')}, status=404)
        
        # 安全检查：防止路径遍历
        if '..' in str(file_path) or not str(file_path).startswith(str(settings.RECORDS_DIR)):
            return JsonResponse({'success': False, 'error': _('非法文件路径')}, status=403)
        
        # 检测 HEIC/HEIF 格式，自动转换为 JPEG
        ext = filename.split('.')[-1].lower()
        if ext in ['heic', 'heif']:
            try:
                from PIL import Image
                from pillow_heif import register_heif_opener
                register_heif_opener()
                
                # 读取 HEIC 并转换为 JPEG
                img = Image.open(file_path)
                img_buffer = io.BytesIO()
                img.convert('RGB').save(img_buffer, format='JPEG', quality=90)
                img_buffer.seek(0)
                
                response = HttpResponse(img_buffer.read(), content_type='image/jpeg')
                response['Content-Disposition'] = f'inline; filename="{filename.rsplit(".", 1)[0]}.jpg"'
                return response
            except Exception as heic_err:
                # HEIC 转换失败，返回原始文件
                import logging
                logging.warning(f"[Prepay] HEIC 转换失败: {heic_err}")
        
        content_type, _ = mimetypes.guess_type(str(file_path))
        response = FileResponse(open(file_path, 'rb'), content_type=content_type or 'application/octet-stream')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def prepay_upload_file_api(request):
    """
    上传预付款文件
    """
    import os
    
    try:
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_prepay_upload_file')
        if not is_valid:
            return JsonResponse({'success': False, 'error': msg}, status=403)
        
        tran_num = request.POST.get('tran_num', '').strip()
        uploaded_file = request.FILES.get('file')
        
        if not tran_num:
            return JsonResponse({'success': False, 'error': _('缺少流水号参数')}, status=400)
        
        if not uploaded_file:
            return JsonResponse({'success': False, 'error': _('未选择文件')}, status=400)
        
        # 验证文件大小
        max_size = 50 * 1024 * 1024  # 50MB
        if uploaded_file.size > max_size:
            return JsonResponse({'success': False, 'error': _('文件大小超过限制')}, status=400)
        
        # 解析年份
        parts = tran_num.split('_')
        if len(parts) >= 2:
            date_part = parts[1]
            year = date_part[:4] if len(date_part) >= 4 else str(datetime.now().year)
        else:
            year = str(datetime.now().year)
        
        # 构建目录
        file_dir = settings.RECORDS_DIR / 'finance' / 'prepay' / year / tran_num
        file_dir.mkdir(parents=True, exist_ok=True)
        
        # 获取扩展名
        ext = os.path.splitext(uploaded_file.name)[1].lower()
        
        # 查找下一个版本号
        existing_versions = []
        if file_dir.exists():
            for f in file_dir.iterdir():
                if f.is_file():
                    # 解析版本号 {tran_num}_V##.ext
                    name = f.stem
                    if '_V' in name:
                        try:
                            v = int(name.split('_V')[-1])
                            existing_versions.append(v)
                        except:
                            pass
        
        next_version = max(existing_versions, default=0) + 1
        filename = f"{tran_num}_V{next_version:02d}{ext}"
        file_path = file_dir / filename
        
        # 保存文件
        with open(file_path, 'wb+') as f:
            for chunk in uploaded_file.chunks():
                f.write(chunk)
        
        return JsonResponse({
            'success': True,
            'filename': filename,
            'message': _('文件上传成功')
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def prepay_delete_file_api(request):
    """
    删除预付款文件
    """
    try:
        data = json.loads(request.body)
        
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_prepay_delete_file')
        if not is_valid:
            return JsonResponse({'success': False, 'error': msg}, status=403)
        
        tran_num = data.get('tran_num', '').strip()
        filename = data.get('filename', '').strip()
        
        if not tran_num or not filename:
            return JsonResponse({'success': False, 'error': _('缺少参数')}, status=400)
        
        # 解析年份
        parts = tran_num.split('_')
        if len(parts) >= 2:
            date_part = parts[1]
            year = date_part[:4] if len(date_part) >= 4 else str(datetime.now().year)
        else:
            year = str(datetime.now().year)
        
        # 构建文件路径
        file_path = settings.RECORDS_DIR / 'finance' / 'prepay' / year / tran_num / filename
        
        if not file_path.exists():
            return JsonResponse({'success': False, 'error': _('文件不存在')}, status=404)
        
        # 安全检查
        if '..' in str(file_path) or not str(file_path).startswith(str(settings.RECORDS_DIR)):
            return JsonResponse({'success': False, 'error': _('非法文件路径')}, status=403)
        
        # 删除文件
        file_path.unlink()
        
        return JsonResponse({
            'success': True,
            'message': _('文件删除成功')
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def prepay_rate_api(request):
    """
    获取最新汇率（从系统配置或最近交易中获取）
    """
    try:
        # 方案1: 从最近的预付款记录中获取汇率
        rate_sql = '''
            SELECT usd_rmb FROM in_pmt_prepay_final
            WHERE tran_curr_type = 'A' AND usd_rmb > 0
            ORDER BY tran_date DESC, tran_num DESC
            LIMIT 1
        '''
        rate_df = DBClient.read_df(rate_sql, {})
        
        if not rate_df.empty:
            rate = float(rate_df.iloc[0]['usd_rmb'])
            return JsonResponse({
                'success': True,
                'rate': rate,
                'source': 'recent_transaction'
            })
        
        # 方案2: 使用默认汇率
        default_rate = 7.2500
        return JsonResponse({
            'success': True,
            'rate': default_rate,
            'source': 'default'
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
