# File: backend/apps/etl/views.py
"""
ETL 数据集成模块视图
功能:
1. Hub 页面 (Tab 导航)
2. Transaction Wizard (上传 → 解析 → 清洗 → 转换)
3. Inventory Wizard (上传 → 校验 → 同步)

安全特性:
- Tab 级别权限控制
- 操作级别密码矩阵
- 审计日志
- 数据库回滚机制
"""
import uuid
import threading
import time
from datetime import date

from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.utils.translation import gettext as _

from core.services.etl.ingest import IngestService
from core.services.etl.parser import TransactionParser
from core.services.etl.transformer import TransactionTransformer
from core.services.correction import CorrectionService
from core.services.inventory.service import InventoryService
# [REMOVED] RollbackConfigManager 已废弃 - 2026-01-27
from core.services.database_service import DatabaseService

# [V2.3] 后台任务管理器 (用于异步执行 Transformer 避免超时)
_etl_tasks = {}  # {task_id: {'status': 'running'/'done'/'error', 'result': {...}, 'error': str}}

from core.sys.logger import get_audit_logger
from backend.core.services.security.policy_manager import SecurityPolicyManager
from apps.log.services import LogErrorService  # [V2.3] 异常日志服务

audit_logger = get_audit_logger()
db_service = DatabaseService()


def _get_data_cutoff_date() -> str:
    """获取 Data_Clean_Log 表的最新日期"""
    from core.components.db.client import DBClient
    try:
        db = DBClient()
        result = db.read_df("SELECT MAX(`order date`) as max_date FROM Data_Clean_Log")
        if not result.empty and result.iloc[0]['max_date']:
            return str(result.iloc[0]['max_date'])
    except:
        pass
    return _("暂无数据")


def _get_db_stats_before() -> dict:
    """获取 Data_Clean_Log 表的统计信息"""
    from core.components.db.client import DBClient
    try:
        db = DBClient()
        
        # 获取记录数
        count_result = db.read_df("SELECT COUNT(*) as cnt FROM Data_Clean_Log")
        count = 0
        if not count_result.empty:
            cnt_val = count_result.iloc[0]['cnt']
            if cnt_val is not None:
                count = int(cnt_val)
        
        # 获取日期范围 (第一列是 order date)
        date_result = db.read_df("SELECT MIN(`order date`) as min_date, MAX(`order date`) as max_date FROM Data_Clean_Log")
        min_date = 'N/A'
        max_date = 'N/A'
        if not date_result.empty:
            min_val = date_result.iloc[0]['min_date']
            max_val = date_result.iloc[0]['max_date']
            if min_val is not None and str(min_val).strip() not in ['', 'None', 'nan', 'NaT']:
                min_date = str(min_val)
            if max_val is not None and str(max_val).strip() not in ['', 'None', 'nan', 'NaT']:
                max_date = str(max_val)
        
        return {'count': count, 'min_date': min_date, 'max_date': max_date}
    except Exception as e:
        audit_logger.warning(f"获取数据库统计失败: {e}")
        return {'count': 0, 'min_date': 'N/A', 'max_date': 'N/A'}



def _check_tab_permission(user, tab_key: str) -> bool:
    """检查用户是否有 Tab 访问权限"""
    from core.services.auth.service import AuthService
    
    # Superuser/Staff 始终有权限
    if user.is_superuser or user.is_staff:
        return True
    
    # 检查用户的模块权限
    perm_key = f"module.etl.{tab_key}"
    user_perms = AuthService.get_permissions(user.username)
    
    # 检查完整key (如 module.etl.trans)
    if perm_key in user_perms:
        return True
    
    # 检查模块级key (如 module.etl，意味着全部 Tab 都有权限)
    if 'module.etl' in user_perms:
        return True
    
    return False


# ============================================================
# Hub 页面
# ============================================================
@login_required(login_url='web_ui:login')
def etl_hub(request):
    """ETL 功能 Hub 页面"""
    can_access_trans = _check_tab_permission(request.user, 'trans')
    can_access_inv = _check_tab_permission(request.user, 'inv')
    
    # 构建 Hub 卡片列表 - 显示所有，通过 has_access 控制点击行为
    hub_items = [
        {
            'id': 'trans',
            'name': _('交易数据上传'),
            'icon': 'fas fa-chart-line',
            'desc': _('上传 eBay Transaction/Earning CSV 报表，系统自动解析、清洗、转换。'),
            'has_access': can_access_trans
        },
        {
            'id': 'inv',
            'name': _('手动上传盘存'),
            'icon': 'fas fa-boxes-stacked',
            'desc': _('上传库存盘点 CSV 文件，校验后同步到盘存表。'),
            'has_access': can_access_inv
        }
    ]
    
    context = {
        'hub_items': hub_items,
        'can_access_trans': can_access_trans,
        'can_access_inv': can_access_inv,
    }
    return render(request, 'etl/hub.html', context)


# ============================================================
# Tab 内容加载
# ============================================================
@login_required(login_url='web_ui:login')
@require_GET
def tab_transaction(request):
    """加载 Transaction Tab 内容"""
    if not _check_tab_permission(request.user, 'trans'):
        # HTMX 请求：触发 Modal 并返回 Hub
        if request.headers.get('HX-Request'):
            resp = HttpResponse('')
            resp['HX-Trigger'] = '{"showNoAccessModal": "交易数据上传"}'
            return resp
        return render(request, 'errors/403.html', status=403)
    
    # [V2.3] 检查URL参数中的stage或session中的stage
    url_stage = request.GET.get('stage')
    session_stage = request.session.get('etl_stage')
    
    # 如果是 done 阶段，显示结果页面
    if session_stage == 'done' or url_stage == 'done':
        result = request.session.get('etl_result', {})
        # 清理 session，下次刷新回到 upload
        request.session.pop('etl_stage', None)
        request.session.pop('etl_result', None)
        request.session.pop('etl_pending_count', None)
        request.session.pop('etl_parse_stats', None)
        request.session.pop('etl_fifo_ratios', None)
        request.session.pop('etl_db_stats_before', None)
        request.session.pop('etl_date_range', None)
        
        return render(request, 'etl/tab_transaction.html', {
            'stage': 'done',
            'result': result,
            'data_cutoff_date': _get_data_cutoff_date(),
        })
    
    # 如果有 URL stage 参数（如 ?stage=clean），保持该阶段
    if url_stage:
        context = {
            'stage': url_stage,
            'data_cutoff_date': _get_data_cutoff_date(),
        }
        return render(request, 'etl/tab_transaction.html', context)
    
    # [设计] 页面刷新或首次加载时，清理 ETL session 状态，重置流程
    # 这是预期行为：ETL 流程不支持中断恢复，必须从头开始
    request.session.pop('etl_stage', None)
    request.session.pop('etl_pending_count', None)
    request.session.pop('etl_parse_stats', None)
    request.session.pop('etl_fifo_ratios', None)
    request.session.pop('etl_db_stats_before', None)
    
    # 始终从 upload 阶段开始
    context = {
        'stage': 'upload',
        'data_cutoff_date': _get_data_cutoff_date(),
    }
    
    return render(request, 'etl/tab_transaction.html', context)


def _render_validation_error(request, error_message):
    """返回验证失败的向导页面（不使用 modal）"""
    context = {
        'stage': 'validate',
        'validation_passed': False,
        'validation_errors': [error_message] if isinstance(error_message, str) else error_message,
        'data_cutoff_date': _get_data_cutoff_date(),
    }
    return render(request, 'etl/tab_transaction.html', context)


def _get_inventory_latest_date() -> str:
    """获取 Data_Inventory 表最后一列的表头（作为最新日期）"""
    from core.components.db.client import DBClient
    try:
        db = DBClient()
        cols_df = db.read_df('SHOW COLUMNS FROM Data_Inventory')
        if not cols_df.empty:
            # 最后一列的列名即为日期
            last_col = cols_df.iloc[-1]['Field']
            return str(last_col)
    except Exception:
        pass
    return "暂无数据"


@login_required(login_url='web_ui:login')
@require_GET
def tab_inventory(request):
    """加载 Inventory Tab 内容"""
    if not _check_tab_permission(request.user, 'inv'):
        # HTMX 请求：触发 Modal 并返回 Hub
        if request.headers.get('HX-Request'):
            resp = HttpResponse('')
            resp['HX-Trigger'] = '{"showNoAccessModal": "手动上传盘存"}'
            return resp
        return render(request, 'errors/403.html', status=403)
    
    # 重置阶段为上传（开始新流程）
    request.session['inv_stage'] = 'upload'
    
    return render(request, 'etl/tab_inventory.html', {
        'today': date.today().isoformat(),
        'stage': 'upload',
        'inv_latest_date': _get_inventory_latest_date(),
    })


# ============================================================
# Transaction Wizard: Upload
# ============================================================
@login_required(login_url='web_ui:login')
@require_POST
def etl_upload(request):
    """处理文件上传 - 不需要密码验证，密码验证在最终确认时"""
    files = request.FILES.getlist('files')
    if not files:
        return HttpResponse(_('<div class="alert alert-danger">未检测到文件，请重新选择。</div>'))

    # [V2.0] 保存 FIFO 回库比例到 session
    fifo_ratios = {
        'RE': float(request.POST.get('fifo_ratio_re', 60)) / 100.0,
        'CR': float(request.POST.get('fifo_ratio_cr', 50)) / 100.0,
        'CC': float(request.POST.get('fifo_ratio_cc', 30)) / 100.0,
    }
    request.session['etl_fifo_ratios'] = fifo_ratios

    # 审计日志
    filenames = [f.name for f in files]
    audit_logger.info(
        f"ETL文件上传: {len(files)} 个文件",
        extra={
            "user": request.user.username,
            "func": "ETL:Upload",
            "action": "UPLOAD_FILE",
            "details": f"Files: {', '.join(filenames)}, FIFO: {fifo_ratios}"
        }
    )

    # 文件分类
    service = IngestService()
    trans_files = []
    earn_files = []

    for f in files:
        try:
            head = f.read(2048).decode('utf-8', errors='ignore').lower()
            f.seek(0)
            if "transaction report" in head:
                trans_files.append(f)
            elif "order earnings report" in head:
                earn_files.append(f)
        except Exception:
            continue

    # ---------- 新增校验逻辑 ----------
    from datetime import date
    import pandas as pd

    def _extract_stats(file_obj):
        """读取 CSV，返回 seller 集合、最小日期、最大日期"""
        try:
            from dateutil import parser as dateutil_parser
            
            # 读取文件寻找 Start date 和 End date 行
            df = pd.read_csv(file_obj, header=None, nrows=50)
            file_obj.seek(0)
            
            sellers = set()
            min_dt = None
            max_dt = None
            
            for _idx, row in df.iterrows():
                first_col = str(row.iloc[0]).strip() if len(row) > 0 else ""
                second_col = str(row.iloc[1]).strip() if len(row) > 1 else ""
                
                # 提取 seller/shop
                if 'seller' in first_col.lower() or 'shop' in first_col.lower():
                    if second_col and second_col.lower() not in ['nan', 'none', '']:
                        sellers.add(second_col)
                
                # 提取 Start date
                if first_col.lower() == 'start date':
                    try:
                        # 格式如: Jan-02-2023 03:45:12 PM PST
                        parsed = dateutil_parser.parse(second_col, fuzzy=True)
                        min_dt = parsed.date()
                    except:
                        pass
                
                # 提取 End date
                if first_col.lower() == 'end date':
                    try:
                        parsed = dateutil_parser.parse(second_col, fuzzy=True)
                        max_dt = parsed.date()
                    except:
                        pass
            
            # 如果没找到 Start/End date 行，尝试用 date 列
            if min_dt is None or max_dt is None:
                file_obj.seek(0)
                df2 = pd.read_csv(file_obj, nrows=1000)
                file_obj.seek(0)
                df2.columns = [c.lower() for c in df2.columns]
                date_col = next((c for c in df2.columns if 'date' in c), None)
                if date_col:
                    dates = pd.to_datetime(df2[date_col], errors='coerce').dropna()
                    if not dates.empty:
                        if min_dt is None:
                            min_dt = dates.min().date()
                        if max_dt is None:
                            max_dt = dates.max().date()
                
                # 提取 seller（如果之前没找到）
                if not sellers:
                    seller_col = next((c for c in df2.columns if 'seller' in c or 'shop' in c), None)
                    if seller_col:
                        sellers = set(df2[seller_col].dropna().astype(str).str.strip())
            
            return sellers, min_dt, max_dt
        except Exception as e:
            audit_logger.warning(f"_extract_stats error: {e}")
            return set(), None, None

    # 必须同时存在 Transaction 与 Earning 文件
    if not trans_files or not earn_files:
        missing = []
        if not trans_files:
            missing.append('Transaction')
        if not earn_files:
            missing.append('Earning')
        return _render_validation_error(request, _("缺少 {missing} 报表文件，请同时上传对应的 CSV。").format(missing=', '.join(missing)))

    # 取首个文件进行统计（假设同批文件结构一致）
    trans_sellers, trans_min, trans_max = _extract_stats(trans_files[0])
    earn_sellers, earn_min, earn_max = _extract_stats(earn_files[0])

    # 检查店铺一致性（如果都有 seller 信息）
    if trans_sellers and earn_sellers and trans_sellers != earn_sellers:
        return _render_validation_error(request, _('Transaction 与 Earning 文件的店铺(seller) 不匹配。'))
    # 检查时间区间一致性（如果都有日期信息）
    if trans_min and earn_min and trans_max and earn_max:
        if trans_min != earn_min or trans_max != earn_max:
            return _render_validation_error(request, _('Transaction 与 Earning 文件的时间区间不一致。Trans: {trans_min}~{trans_max}, Earn: {earn_min}~{earn_max}').format(trans_min=trans_min, trans_max=trans_max, earn_min=earn_min, earn_max=earn_max))
    # 检查最新日期不能是今天或未来（只有当有日期时才检查）
    today = date.today()
    if trans_max is not None and trans_max >= today:
        return _render_validation_error(request, _('文件中的最新日期({trans_max})不能是今天({today})或未来。请检查数据日期。').format(trans_max=trans_max, today=today))
    # ---------- 校验结束 ----------

    # [回滚机制已移除] - 2026-01-27

    # 执行摄入
    try:
        result = service.run_ingest_pipeline(trans_files, earn_files)
        result_msg = result.get('message', '')
        date_range = result.get('date_range', (None, None))
        
        # 更新 session 阶段
        request.session['etl_stage'] = 'parse'
        request.session['etl_upload_result'] = result_msg
        request.session['etl_date_range'] = date_range  # [V2.3] 保存日期范围
        
        # 返回整个 tab 内容以更新进度指示器
        return render(request, 'etl/tab_transaction.html', {
            'stage': 'parse',
            'upload_result': result_msg
        })
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[ETL ERROR] etl_upload failed:\n{error_detail}")
        audit_logger.error(f"ETL摄入失败: {str(e)}", extra={"user": request.user.username, "func": "ETL:Upload"})
        LogErrorService.create_from_exception(request=request, exception=e, severity='HIGH', category='ETL')
        return HttpResponse(f'<div class="alert alert-danger">{_("处理失败")}: {str(e)}</div>')


# ============================================================
# Transaction Wizard: Parse
# ============================================================
@login_required(login_url='web_ui:login')
@require_POST
def etl_parse(request):
    """触发解析"""
    parser = TransactionParser()
    
    # [V2.3] 获取日期范围
    date_range = request.session.get('etl_date_range', (None, None))
    
    try:
        result = parser.run(date_range=date_range)
        status = result.get("status")
        fixed = len(result.get("auto_fixed", []))
        pending = result.get("pending_count", 0)
        
        # 审计日志
        audit_logger.info(
            f"ETL数据解析完成: {status}",
            extra={
                "user": request.user.username,
                "func": "ETL:Parse",
                "action": "PARSE_DATA",
                "details": f"Status: {status}, Fixed: {fixed}, Pending: {pending}"
            }
        )

        if status == "success":
            # 保存解析统计到 session
            auto_fixed_list = result.get("auto_fixed", [])
            request.session['etl_parse_stats'] = {
                'error_count': pending + fixed,
                'auto_fixed': fixed,
                'manual_fixed': 0,  # 将在 fix_sku 时累加
                'fix_log': auto_fixed_list[:50],  # 限制存储数量
            }
            
            if pending > 0:
                # 需要人工清洗
                request.session['etl_stage'] = 'clean'
                request.session['etl_pending_count'] = pending
                
                # 获取第一个待处理项
                correction_svc = CorrectionService()
                pending_item = correction_svc.get_next_pending_issue()
                suggestions = []
                
                if pending_item is not None:
                    bad_sku = _get_bad_sku(pending_item)
                    if bad_sku and bad_sku != 'PARSE_FAILED':
                        suggestions = correction_svc.get_fuzzy_suggestions(bad_sku)
                
                # 返回整个 tab 内容以更新进度指示器
                return render(request, 'etl/tab_transaction.html', {
                    'stage': 'clean',
                    'pending_count': pending,
                    'pending_item': _format_pending_item(pending_item) if pending_item is not None else None,
                    'suggestions': suggestions,
                    'data_cutoff_date': _get_data_cutoff_date(),
                })
            else:
                # 无待处理，直接转换
                request.session['etl_stage'] = 'transform'
                # 保存当前数据库状态
                db_stats = _get_db_stats_before()
                request.session['etl_db_stats_before'] = db_stats
                return render(request, 'etl/tab_transaction.html', {
                    'stage': 'transform',
                    'pending_count': 0,
                    'pending_item': None,
                    'parse_stats': request.session.get('etl_parse_stats', {}),
                    'db_stats_before': db_stats,
                    'data_cutoff_date': _get_data_cutoff_date(),
                })
        else:
            # status 为 empty 或 error
            if status == 'empty':
                error_msg = _('Data_Transaction 表为空，请先上传数据。')
            else:
                error_msg = result.get('message', _('未知错误'))
            return _render_validation_error(request, error_msg)

    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        print(f"\n{'='*60}\n[ETL PARSE ERROR]\n{tb_str}\n{'='*60}\n")  # 输出到控制台
        audit_logger.error(f"ETL解析失败: {str(e)}\n{tb_str}", extra={"user": request.user.username, "func": "ETL:Parse"})
        LogErrorService.create_from_exception(request=request, exception=e, severity='HIGH', category='ETL')
        return HttpResponse(f'<div class="alert alert-danger">{_("引擎错误")}: {str(e)}</div>')


def _get_bad_sku(row):
    """从待处理行中提取坏 SKU"""
    for i in range(1, 11):
        sku = str(row.get(f'P_SKU{i}', '')).strip()
        if sku and sku.lower() not in ['none', 'nan', '']:
            correction_svc = CorrectionService()
            if not correction_svc.is_valid_sku(sku):
                return sku
    return 'PARSE_FAILED'


def _format_pending_item(row):
    """格式化待处理项"""
    if row is None:
        return None
    
    bad_sku = _get_bad_sku(row)
    bad_qty = '0'
    slot_idx = 1
    
    for i in range(1, 11):
        sku = str(row.get(f'P_SKU{i}', '')).strip()
        qty = str(row.get(f'P_Quantity{i}', '')).strip()
        if sku and sku.lower() not in ['none', 'nan', '']:
            correction_svc = CorrectionService()
            if not correction_svc.is_valid_sku(sku):
                bad_qty = qty
                slot_idx = i
                break
    
    return {
        'order_id': row.get('Order number', ''),
        'label': row.get('Custom label', ''),
        'title': row.get('Item title', ''),
        'bad_sku': bad_sku,
        'bad_qty': bad_qty,
        'slot_idx': slot_idx
    }


# ============================================================
# Transaction Wizard: Fix SKU
# ============================================================
@login_required(login_url='web_ui:login')
@require_POST
def etl_fix_sku(request):
    """提交 SKU 修正"""
    try:
        # 安全验证
        passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_commit_sku_fix')
        if not passed:
            return HttpResponse(_('<div class="alert alert-danger">安全验证失败</div>'), status=403)
        
        order_id = request.POST.get('order_id')
        slot_idx = int(request.POST.get('slot_idx', 1))
        old_sku = request.POST.get('old_sku')
        old_qty = request.POST.get('old_qty')
        new_sku = request.POST.get('new_sku', '').strip().upper()
        new_qty = request.POST.get('new_qty', '1').strip()
        label = request.POST.get('label', '')
        
        if not new_sku:
            return HttpResponse(_('<div class="alert alert-danger">SKU 不能为空</div>'))
        
        correction_svc = CorrectionService()
        
        if not correction_svc.is_valid_sku(new_sku):
            return HttpResponse(_('<div class="alert alert-danger">SKU [{new_sku}] 无效 (资料库中不存在)</div>').format(new_sku=new_sku))
        
        try:
            qty_val = float(new_qty)
            if qty_val <= 0:
                raise ValueError
        except:
            return HttpResponse(_('<div class="alert alert-danger">数量无效: {new_qty}</div>').format(new_qty=new_qty))
        
        # 执行修复
        success = correction_svc.apply_fix_transactional(
            order_id, slot_idx, label, old_sku, old_qty, new_sku, str(int(qty_val))
        )
        
        if success:
            # 审计日志
            audit_logger.info(
                f"SKU修正: {old_sku} -> {new_sku}",
                extra={
                    "user": request.user.username,
                    "func": "ETL:Fix",
                    "action": "FIX_SKU",
                    "details": f"Order: {order_id}, Old: {old_sku}, New: {new_sku}, Qty: {new_qty}"
                }
            )
            
            # 累加人工修复计数
            parse_stats = request.session.get('etl_parse_stats', {})
            parse_stats['manual_fixed'] = parse_stats.get('manual_fixed', 0) + 1
            # 记录修复日志
            fix_log = parse_stats.get('fix_log', [])
            fix_log.append({
                'order': order_id, 
                'old': old_sku, 
                'new': new_sku, 
                'old_qty': old_qty,
                'new_qty': str(int(qty_val)),
                'custom_label': label,  # 用于按商品分组
                'type': 'manual'
            })
            parse_stats['fix_log'] = fix_log[-50:]  # 限制数量
            request.session['etl_parse_stats'] = parse_stats
            
            # 检查是否还有更多待处理
            next_item = correction_svc.get_next_pending_issue()
            pending_count = request.session.get('etl_pending_count', 1) - 1
            request.session['etl_pending_count'] = max(0, pending_count)
            
            if next_item is not None:
                suggestions = []
                bad_sku = _get_bad_sku(next_item)
                if bad_sku and bad_sku != 'PARSE_FAILED':
                    suggestions = correction_svc.get_fuzzy_suggestions(bad_sku)
                
                # 返回整个 tab 内容以更新进度指示器
                return render(request, 'etl/tab_transaction.html', {
                    'stage': 'clean',
                    'pending_count': pending_count,
                    'pending_item': _format_pending_item(next_item),
                    'suggestions': suggestions
                })
            else:
                # 全部完成，可以转换
                request.session['etl_stage'] = 'transform'
                # 保存当前数据库状态
                db_stats = _get_db_stats_before()
                request.session['etl_db_stats_before'] = db_stats
                return render(request, 'etl/tab_transaction.html', {
                    'stage': 'transform',
                    'pending_count': 0,
                    'pending_item': None,
                    'parse_stats': request.session.get('etl_parse_stats', {}),
                    'db_stats_before': db_stats,
                    'data_cutoff_date': _get_data_cutoff_date(),
                })
        else:
            return HttpResponse(_('<div class="alert alert-danger">修复失败，请检查日志</div>'))
    
    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        print(f"\n{'='*60}\n[ETL FIX_SKU ERROR]\n{tb_str}\n{'='*60}\n")
        audit_logger.error(f"ETL SKU修复失败: {str(e)}", extra={"user": request.user.username, "func": "ETL:Fix"})
        LogErrorService.create_from_exception(request=request, exception=e, severity='MEDIUM', category='ETL')
        return HttpResponse(f'<div class="alert alert-danger">{_("系统错误")}: {str(e)}</div>')


# ============================================================
# Transaction Wizard: Transform (预览确认页面)
# ============================================================
@login_required(login_url='web_ui:login')
@require_POST
def etl_transform(request):
    """
    显示转换预览页面 - 不执行真正的转换
    真正的转换在 etl_confirm 中执行并需要密码验证
    """
    try:
        # 保存当前数据库状态供对比
        db_stats_before = _get_db_stats_before()
        request.session['etl_db_stats_before'] = db_stats_before
        request.session['etl_stage'] = 'transform'
        
        # 获取解析统计
        parse_stats = request.session.get('etl_parse_stats', {})
        
        # 返回预览确认页面
        return render(request, 'etl/tab_transaction.html', {
            'stage': 'transform',
            'parse_stats': parse_stats,
            'db_stats_before': db_stats_before,
            'data_cutoff_date': _get_data_cutoff_date(),
        })
    
    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        print(f"\n{'='*60}\n[ETL TRANSFORM ERROR]\n{tb_str}\n{'='*60}\n")
        audit_logger.error(f"ETL Transform页面加载失败: {str(e)}", extra={"user": request.user.username, "func": "ETL:Transform"})
        LogErrorService.create_from_exception(request=request, exception=e, severity='MEDIUM', category='ETL')
        return HttpResponse(f'<div class="alert alert-danger">{_("系统错误")}: {str(e)}</div>')


# ============================================================
# ============================================================
# Inventory Wizard: Validate
# ============================================================
@login_required(login_url='web_ui:login')
@require_POST
def inv_validate(request):
    """库存文件校验 - 无需密码验证"""
    from difflib import get_close_matches
    from core.components.db.client import DBClient
    
    inv_file = request.FILES.get('inv_file')
    target_date = request.POST.get('target_date')
    
    if not inv_file:
        return HttpResponse(_('<div class="alert alert-danger">请选择文件</div>'))
    
    service = InventoryService()
    
    try:
        passed, errors, df = service.validate_csv(inv_file)
        
        if passed:
            # 保存 DataFrame 到 session (使用 key)
            session_key = str(uuid.uuid4())
            request.session[f'inv_df_{session_key}'] = df.to_json()
            
            # 更新阶段
            request.session['inv_stage'] = 'validate'
            
            # 审计日志
            audit_logger.info(
                f"库存校验通过: {len(df)} 行",
                extra={
                    "user": request.user.username,
                    "func": "ETL:Inventory",
                    "action": "VALIDATE_INVENTORY",
                    "details": f"Rows: {len(df)}, Date: {target_date}"
                }
            )
            
            return render(request, 'etl/partials/inv_validate_result.html', {
                'valid': True,
                'row_count': len(df),
                'preview_rows': df.to_dict('records'),  # 全部数据
                'target_date': target_date,
                'session_key': session_key
            })
        else:
            # 获取系统中所有可用 SKU（从 Data_COGS 表）
            db = DBClient()
            try:
                cogs_df = db.read_df('SELECT sku FROM Data_COGS')
                all_skus = sorted(cogs_df['sku'].dropna().astype(str).unique().tolist())
            except Exception:
                all_skus = []
            
            # 为每个错误的 SKU 生成模糊匹配建议（前5个）
            sku_corrections = []
            for bad_sku in errors:
                suggestions = get_close_matches(str(bad_sku), all_skus, n=5, cutoff=0.4)
                sku_corrections.append({
                    'bad_sku': bad_sku,
                    'suggestions': suggestions,
                })
            
            # 保存原始 df 和错误信息到 session 以便后续修正
            session_key = str(uuid.uuid4())
            request.session[f'inv_df_{session_key}'] = df.to_json()
            request.session[f'inv_errors_{session_key}'] = errors
            request.session[f'inv_target_date_{session_key}'] = target_date
            
            return render(request, 'etl/partials/inv_validate_result.html', {
                'valid': False,
                'error_type': 'format' if (errors and "未找到" in str(errors[0])) else 'sku',
                'error_message': errors[0] if errors else _('未知错误'),
                'unknown_skus': errors if errors else [],
                'sku_corrections': sku_corrections,
                'all_skus': all_skus,
                'session_key': session_key,
                'target_date': target_date,
            })
            
    except Exception as e:
        audit_logger.error(f"库存校验失败: {str(e)}", extra={"user": request.user.username, "func": "ETL:Inventory"})
        return HttpResponse(f'<div class="alert alert-danger">{_("校验失败")}: {str(e)}</div>')


# ============================================================
# Inventory Wizard: Sync
# ============================================================
@login_required(login_url='web_ui:login')
@require_POST
def inv_sync(request):
    """库存同步入库 - 需要密码验证，且检查日期列是否已存在"""
    import pandas as pd
    from core.components.db.client import DBClient
    
    target_date = request.POST.get('target_date')
    session_key = request.POST.get('session_key')
    confirm_overwrite = request.POST.get('confirm_overwrite')  # 用户确认覆盖标志
    
    # 从 session 恢复 DataFrame
    df_json = request.session.get(f'inv_df_{session_key}')
    if not df_json:
        return HttpResponse(_('<div class="alert alert-danger">数据已过期，请重新上传</div>'))
    
    df = pd.read_json(df_json)
    
    # 检查 Data_Inventory 表是否已存在该日期列
    db = DBClient()
    try:
        cols_df = db.read_df('SHOW COLUMNS FROM Data_Inventory')
        existing_cols = [str(c).strip() for c in cols_df['Field'].tolist()]
    except Exception:
        existing_cols = []
    
    # 如果日期列已存在，且用户尚未确认覆盖
    if target_date in existing_cols and confirm_overwrite != 'yes':
        # 返回确认覆盖提示页面
        return render(request, 'etl/partials/inv_overwrite_confirm.html', {
            'target_date': target_date,
            'session_key': session_key,
        })
    
    # 用户已确认覆盖（或日期列不存在），执行密码验证
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_sync_inventory')
    if not passed:
        return HttpResponse(_('<div class="alert alert-danger">安全验证失败</div>'), status=403)
    
    # [回滚机制已移除] - 2026-01-27

    service = InventoryService()
    
    try:
        result_msg = service.sync_inventory_to_db(df, target_date)
        
        # 审计日志
        audit_logger.info(
            f"库存同步完成",
            extra={
                "user": request.user.username,
                "func": "ETL:Inventory",
                "action": "SYNC_INVENTORY",
                "details": f"Date: {target_date}, Rows: {len(df)}"
            }
        )
        
        # 清理 session
        request.session.pop(f'inv_df_{session_key}', None)
        request.session['inv_stage'] = 'done'
        
        # 返回部分模板以避免重复渲染向导头部
        return render(request, 'etl/partials/inv_done.html', {
            'target_date': target_date,
            'row_count': len(df),
        })
        
    except Exception as e:
        audit_logger.error(f"库存同步失败: {str(e)}", extra={"user": request.user.username, "func": "ETL:Inventory"})
        return HttpResponse(f'<div class="alert alert-danger">{_("同步失败")}: {str(e)}</div>')


# ============================================================
# Inventory Wizard: Check Date (API)
# ============================================================
@login_required(login_url='web_ui:login')
@require_GET
def inv_check_date(request):
    """检查 Data_Inventory 表是否已存在指定日期列"""
    from django.http import JsonResponse
    from core.components.db.client import DBClient
    
    target_date = request.GET.get('date', '')
    if not target_date:
        return JsonResponse({'exists': False})
    
    try:
        db = DBClient()
        cols_df = db.read_df('SHOW COLUMNS FROM Data_Inventory')
        existing_cols = [str(c).strip() for c in cols_df['Field'].tolist()]
        exists = target_date in existing_cols
        return JsonResponse({'exists': exists, 'date': target_date})
    except Exception:
        return JsonResponse({'exists': False, 'error': 'Database error'})


# ============================================================
# Inventory Wizard: Apply Corrections
# ============================================================
@login_required(login_url='web_ui:login')
@require_POST
def inv_apply_corrections(request):
    """应用 SKU 修正并返回校验通过页面（预览全部数据）"""
    import pandas as pd
    from core.components.db.client import DBClient
    
    session_key = request.POST.get('session_key')
    target_date = request.POST.get('target_date')
    
    # 从 session 恢复 DataFrame
    df_json = request.session.get(f'inv_df_{session_key}')
    if not df_json:
        return HttpResponse(f'<div class="alert alert-danger">{_("数据已过期，请重新上传")}</div>')
    
    df = pd.read_json(df_json)
    
    # 收集修正信息
    corrections = {}
    skipped_skus = []
    for key, value in request.POST.items():
        if key.startswith('sku_correction_'):
            bad_sku = key.replace('sku_correction_', '')
            corrections[bad_sku] = value
            if value == 'SKIP':
                skipped_skus.append(bad_sku.upper())
    
    # 应用修正到 DataFrame
    for bad_sku, new_sku in corrections.items():
        mask = df['SKU'].astype(str).str.upper() == bad_sku.upper()
        if new_sku == 'SKIP':
            # 删除跳过的行
            df = df[~mask]
        else:
            # 替换 SKU
            df.loc[mask, 'SKU'] = new_sku
    
    # 更新 session 中的 DataFrame（修正后的）
    new_session_key = str(uuid.uuid4())
    request.session[f'inv_df_{new_session_key}'] = df.to_json()
    
    # 更新 session 阶段
    request.session['inv_stage'] = 'validate'
    
    # 返回校验通过页面（与无错误时相同）
    return render(request, 'etl/partials/inv_validate_result.html', {
        'valid': True,
        'row_count': len(df),
        'preview_rows': df.to_dict('records'),  # 全部数据
        'target_date': target_date,
        'session_key': new_session_key,
        'corrections_applied': len(corrections),
        'skipped_count': len(skipped_skus),
    })


# ============================================================
# Transaction Wizard: Cancel (取消流程)
# ============================================================
@login_required(login_url='web_ui:login')
@require_POST
def etl_cancel(request):
    """取消 ETL 流程，释放资源"""
    # 清理 session 状态
    request.session.pop('etl_stage', None)
    request.session.pop('etl_pending_count', None)
    request.session.pop('etl_upload_result', None)
    request.session.pop('etl_parse_stats', None)
    request.session.pop('etl_db_stats_before', None)
    
    # 审计日志
    audit_logger.info(
        "ETL流程已取消",
        extra={
            "user": request.user.username,
            "func": "ETL:Cancel",
            "action": "CANCEL_ETL"
        }
    )
    
    # 返回上传页面
    return render(request, 'etl/tab_transaction.html', {
        'stage': 'upload',
        'data_cutoff_date': _get_data_cutoff_date(),
    })


# ============================================================
# Transaction Wizard: Confirm (最终确认入库)
# ============================================================
def _run_etl_task(task_id, date_range, fifo_ratios, db_stats_before, parse_stats, username):
    """后台执行 ETL 任务 - 支持进度跟踪"""
    global _etl_tasks
    try:
        print(f"[ETL Task {task_id[:8]}] Started with date_range={date_range}")
        
        # 进度回调函数 - Transformer 调用时会更新全局任务状态
        def update_progress(progress_pct, stage_msg):
            # 映射 Transformer 的 0-100% 到整体流程的 30-85%
            # 因为解析阶段占 0-30%，统计阶段占 85-100%
            mapped_progress = 30 + int(progress_pct * 0.55)  # 30 + 0-55 = 30-85
            _etl_tasks[task_id] = {
                'status': 'running', 
                'progress': mapped_progress, 
                'stage': stage_msg
            }
            print(f"[ETL Task {task_id[:8]}] Progress: {mapped_progress}% - {stage_msg}")
        
        # 阶段 1: 解析数据 (0-30%)
        _etl_tasks[task_id] = {'status': 'running', 'progress': 5, 'stage': '正在解析数据...'}
        print(f"[ETL Task {task_id[:8]}] Stage 1: Parsing data...")
        parser = TransactionParser()
        parse_result = parser.run(date_range=date_range)
        df_trans = parse_result.get('df_trans')
        
        _etl_tasks[task_id] = {'status': 'running', 'progress': 25, 'stage': '解析完成，准备转换...'}
        
        if df_trans is None or len(df_trans) == 0:
            print(f"[ETL Task {task_id[:8]}] No data to process, completing with empty result")
            _etl_tasks[task_id] = {'status': 'done', 'result': {
                'error_count': 0, 'auto_fixed': 0, 'manual_fixed': 0, 'fix_log': [],
                'data_count': 0, 'dedup_count': 0, 'actual_upload': 0,
                'before_count': db_stats_before.get('count', 0),
                'before_min_date': db_stats_before.get('min_date', 'N/A'),
                'before_max_date': db_stats_before.get('max_date', 'N/A'),
                'after_count': db_stats_before.get('count', 0),
                'after_min_date': db_stats_before.get('min_date', 'N/A'),
                'after_max_date': db_stats_before.get('max_date', 'N/A'),
                'fifo_stats': {},
            }}
            return
        
        print(f"[ETL Task {task_id[:8]}] Parsed {len(df_trans)} rows")
        
        # 阶段 2: 数据转换 (30-85%) - 使用进度回调
        _etl_tasks[task_id] = {'status': 'running', 'progress': 30, 'stage': f'正在处理 {len(df_trans)} 条数据...'}
        print(f"[ETL Task {task_id[:8]}] Stage 2: Transforming data...")
        transformer = TransactionTransformer()
        transform_result = transformer.run(
            progress_callback=update_progress,  # 传递进度回调
            return_ratios=fifo_ratios, 
            df_trans_input=df_trans, 
            date_range=date_range
        )
        print(f"[ETL Task {task_id[:8]}] Transform complete: {transform_result.get('actual_upload', 0)} rows uploaded")
        
        # 阶段 3: 统计结果 (85-100%)
        _etl_tasks[task_id] = {'status': 'running', 'progress': 90, 'stage': '正在统计结果...'}
        from core.components.db.client import DBClient
        db = DBClient()
        after_df = db.read_df("""
            SELECT COUNT(*) as count, 
                   MIN(`order date`) as min_date, 
                   MAX(`order date`) as max_date 
            FROM Data_Clean_Log
        """)
        db_stats_after = {
            'count': int(after_df['count'].iloc[0]) if not after_df.empty else 0,
            'min_date': str(after_df['min_date'].iloc[0]) if not after_df.empty else 'N/A',
            'max_date': str(after_df['max_date'].iloc[0]) if not after_df.empty else 'N/A',
        }
        
        # 收集统计信息
        stats = {
            'error_count': parse_stats.get('error_count', 0),
            'auto_fixed': parse_stats.get('auto_fixed', 0),
            'manual_fixed': parse_stats.get('manual_fixed', 0),
            'fix_log': parse_stats.get('fix_log', []),
            'data_count': transform_result.get('data_count', 0),
            'dedup_count': transform_result.get('dedup_count', 0),
            'actual_upload': transform_result.get('actual_upload', 0),
            'before_count': db_stats_before.get('count', 0),
            'before_min_date': db_stats_before.get('min_date', 'N/A'),
            'before_max_date': db_stats_before.get('max_date', 'N/A'),
            'after_count': db_stats_after.get('count', 0),
            'after_min_date': db_stats_after.get('min_date', 'N/A'),
            'after_max_date': db_stats_after.get('max_date', 'N/A'),
            'fifo_stats': transform_result.get('fifo_stats', {}),
        }
        
        # 审计日志
        audit_logger.info(
            "ETL数据入库完成",
            extra={
                "user": username,
                "func": "ETL:Confirm",
                "action": "CONFIRM_ETL",
                "details": f"Before: {db_stats_before.get('count', 0)} rows, After: {db_stats_after.get('count', 0)} rows"
            }
        )
        
        _etl_tasks[task_id] = {'status': 'done', 'progress': 100, 'result': stats}
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        audit_logger.error(
            f"ETL入库失败: {str(e)}\n{error_detail}", 
            extra={"user": username, "func": "ETL:Confirm"}
        )
        print(f"[ETL ERROR] Task {task_id} failed:\n{error_detail}")  # 控制台输出
        _etl_tasks[task_id] = {'status': 'error', 'error': f"{str(e)} - 详见服务器日志"}


@login_required(login_url='web_ui:login')
@require_POST
def etl_confirm(request):
    """最终确认数据入库 - 异步执行避免超时"""
    try:
        print(f"[ETL] etl_confirm called by user: {request.user.username}")
        
        # 安全验证
        passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_run_transform')
        if not passed:
            print(f"[ETL] Security verification failed: {reason}")
            return HttpResponse(f'<div class="alert alert-danger">{_("安全验证失败，请检查密码")}</div>', status=403)
        
        print("[ETL] Security verification passed")
        
        # 获取参数
        db_stats_before = request.session.get('etl_db_stats_before', {})
        if not db_stats_before:
            db_stats_before = _get_db_stats_before()
        
        fifo_ratios = request.session.get('etl_fifo_ratios', {'RE': 0.6, 'CR': 0.5, 'CC': 0.3})
        date_range = request.session.get('etl_date_range', (None, None))
        parse_stats = request.session.get('etl_parse_stats', {})
        
        print(f"[ETL] Parameters: date_range={date_range}, fifo_ratios={fifo_ratios}")
        
        # 创建任务
        task_id = str(uuid.uuid4())
        _etl_tasks[task_id] = {'status': 'running'}
        
        print(f"[ETL] Created task: {task_id}")
        
        # 启动后台线程
        thread = threading.Thread(
            target=_run_etl_task,
            args=(task_id, date_range, fifo_ratios, db_stats_before, parse_stats, request.user.username),
            daemon=True
        )
        thread.start()
        
        print(f"[ETL] Background thread started for task: {task_id}")
        
        # 保存任务ID到session
        request.session['etl_task_id'] = task_id
        
        # 立即返回"处理中"页面
        print(f"[ETL] Returning processing stage with task_id: {task_id}")
        return render(request, 'etl/tab_transaction.html', {
            'stage': 'processing',
            'task_id': task_id,
            'data_cutoff_date': _get_data_cutoff_date(),
        })
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[ETL ERROR] etl_confirm failed:\n{error_detail}")
        audit_logger.error(f"ETL确认入库失败: {str(e)}\n{error_detail}", extra={"user": request.user.username, "func": "ETL:Confirm"})
        return HttpResponse(f'<div class="alert alert-danger">系统错误: {str(e)}</div>', status=500)


@login_required(login_url='web_ui:login')
@require_GET
def etl_task_status(request):
    """查询 ETL 任务状态"""
    task_id = request.GET.get('task_id') or request.session.get('etl_task_id')
    
    if not task_id or task_id not in _etl_tasks:
        return JsonResponse({'status': 'not_found'})
    
    task = _etl_tasks[task_id]
    
    if task['status'] == 'done':
        # 任务完成，设置 stage 为 done 以显示结果页面
        request.session['etl_stage'] = 'done'
        # 保存结果供 tab_transaction 使用
        request.session['etl_result'] = task['result']
        
        # 清理无关的 session 数据
        request.session.pop('etl_pending_count', None)
        request.session.pop('etl_upload_result', None)
        request.session.pop('etl_task_id', None)
        
        # 清理任务 (保留 result 在 session 中)
        del _etl_tasks[task_id]
        
        return JsonResponse({'status': 'done', 'result': task['result']})
    
    elif task['status'] == 'error':
        # 任务失败，重置到上传阶段
        request.session['etl_stage'] = 'upload'
        error_msg = task.get('error', 'Unknown error')
        del _etl_tasks[task_id]
        return JsonResponse({'status': 'error', 'error': error_msg})
    
    else:
        # 返回进度信息
        return JsonResponse({
            'status': 'running',
            'progress': task.get('progress', 0),
            'stage': task.get('stage', '处理中...')
        })