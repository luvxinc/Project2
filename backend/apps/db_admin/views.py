import json
import logging
import os
import subprocess
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.utils.translation import gettext as _
from backend.core.services.database_service import DatabaseService
from backend.core.services.auth.service import AuthService
from backend.core.services.security.policy_manager import SecurityPolicyManager
import datetime
import pandas as pd

from backend.core.sys.logger import get_audit_logger

logger = logging.getLogger(__name__)
audit_logger = get_audit_logger()


def check_perm(user, perm_key):
    """
    Helper to check if user has specific permission via AuthService or is Superuser.
    
    [P0-2 Fix] This function now uses STRICT leaf-node enforcement:
    - For leaf permissions (e.g., module.db_admin.backup.create), user MUST have that exact key
    - AuthService.get_permissions() already handles parent inference (child implies parent)
    - We do NOT do reverse inference here (having parent does NOT imply having all children)
    """
    if user.is_superuser: return True
    
    # Get permissions with parent inference from AuthService
    perms = AuthService.get_permissions(user.username)
    
    # Direct match only - no child-prefix inference here
    # AuthService already infers parents from children, so if user has any child of perm_key,
    # perm_key itself will be in perms. We just check direct presence.
    return perms.get(perm_key, False)

# --- Helper for Feature Switch ---
def check_feature_switch(module_key: str) -> bool:
    try:
        from backend.common.settings import settings
        config = settings.load_modules_config()
        # Find module by key
        for mod in config:
            if mod.get('key') == module_key:
                return mod.get('enabled', True)
        return True # Default enabled if not found
    except:
        return True

@login_required(login_url='web_ui:login')
def dashboard_view(request):
    """
    Render database admin hub (entry page).
    Hub now only displays entry cards to sub-pages.
    """
    # 0. Check Feature Switch
    if not check_feature_switch("db_admin"):
         return render(request, "errors/403.html", status=403)

    # 1. Check Module Permission
    if not check_perm(request.user, 'module.db_admin'):
        return render(request, "errors/403.html", status=403)

    # 2. Get User Permissions
    # [P0-2 Fix] Each feature checks its SPECIFIC leaf permission only
    # NO has_module fallback - having any child does NOT grant all siblings
    perms = AuthService.get_permissions(request.user.username)
    
    user_context = {
        "can_backup": request.user.is_superuser or bool(perms.get('module.db_admin.backup.create')),
        "can_restore": request.user.is_superuser or bool(perms.get('module.db_admin.backup.restore')),
        "can_manage": request.user.is_superuser or bool(perms.get('module.db_admin.backup.manage')),
        "can_delete": request.user.is_superuser or bool(perms.get('module.db_admin.cleanup.delete')),
    }

    # Hub Items Definition - 使用 URL 跳转到独立子页面
    hub_items = [
        {'id': 'backup', 'name': _('数据备份'), 'icon': 'fas fa-cloud-upload-alt', 'desc': _('生成全量数据库快照，支持标签管理。'), 'url': '/dashboard/db_admin/backup/', 'has_access': user_context['can_backup']},
        {'id': 'restore', 'name': _('数据恢复'), 'icon': 'fas fa-history', 'desc': _('从现有快照还原数据库。操作不可逆。'), 'url': '/dashboard/db_admin/restore/', 'has_access': user_context['can_restore']},
        {'id': 'manage', 'name': _('备份管理'), 'icon': 'fas fa-folder-open', 'desc': _('查看或批量删除历史备份文件。'), 'url': '/dashboard/db_admin/manage/', 'has_access': user_context['can_manage']},
        {'id': 'clean', 'name': _('数据清洗'), 'icon': 'fas fa-biohazard', 'desc': _('符合合规标准的数据物理擦除工具。'), 'url': '/dashboard/db_admin/clean/', 'has_access': user_context['can_delete']},
    ]

    context = {
        "hub_items": hub_items,
        "perms": user_context,
        "is_superuser": request.user.is_superuser
    }
    return render(request, 'db_admin/hub.html', context)


# ==============================================================================
# Sub-Pages (子路由页面)
# ==============================================================================

def _get_backup_context(request):
    """Helper to build common backup context for sub-pages."""
    # [P0-2 Fix] Each feature checks its SPECIFIC leaf permission only
    perms = AuthService.get_permissions(request.user.username)
    
    user_context = {
        "can_backup": request.user.is_superuser or bool(perms.get('module.db_admin.backup.create')),
        "can_restore": request.user.is_superuser or bool(perms.get('module.db_admin.backup.restore')),
        "can_manage": request.user.is_superuser or bool(perms.get('module.db_admin.backup.manage')),
        "can_delete": request.user.is_superuser or bool(perms.get('module.db_admin.cleanup.delete')),
    }
    
    # List Backups
    service = DatabaseService()
    backups = service.list_backups()
    safe_backups = []
    for f in backups:
        display_name = service.parse_filename_to_display(f)
        safe_backups.append({
            "filename": f,
            "display": display_name,
            "size_kb": f"{os.path.getsize(service.backup_dir / f) / 1024:.1f} KB"
        })
    
    return {
        "backups": safe_backups,
        "perms": user_context,
        "is_superuser": request.user.is_superuser
    }


@login_required(login_url='web_ui:login')
def backup_page(request):
    """数据备份子页面"""
    if not check_feature_switch("db_admin"):
        return render(request, "errors/403.html", status=403)
    if not check_perm(request.user, 'module.db_admin.backup.create'):
        return render(request, "errors/403.html", status=403)
    
    context = _get_backup_context(request)
    return render(request, 'db_admin/pages/backup.html', context)


@login_required(login_url='web_ui:login')
def restore_page(request):
    """数据恢复子页面"""
    if not check_feature_switch("db_admin"):
        return render(request, "errors/403.html", status=403)
    if not check_perm(request.user, 'module.db_admin.backup.restore'):
        return render(request, "errors/403.html", status=403)
    
    context = _get_backup_context(request)
    return render(request, 'db_admin/pages/restore.html', context)


@login_required(login_url='web_ui:login')
def manage_page(request):
    """备份管理子页面"""
    if not check_feature_switch("db_admin"):
        return render(request, "errors/403.html", status=403)
    if not check_perm(request.user, 'module.db_admin.backup.manage'):
        return render(request, "errors/403.html", status=403)
    
    context = _get_backup_context(request)
    return render(request, 'db_admin/pages/manage.html', context)


@login_required(login_url='web_ui:login')
def clean_page(request):
    """数据清洗子页面 (仅扩展权限用户可访问)"""
    if not check_feature_switch("db_admin"):
        return render(request, "errors/403.html", status=403)
    if not check_perm(request.user, 'module.db_admin'):
        return render(request, "errors/403.html", status=403)
    
    # [P0-2 Fix] Check SPECIFIC leaf permission only
    perms = AuthService.get_permissions(request.user.username)
    can_delete = request.user.is_superuser or bool(perms.get('module.db_admin.cleanup.delete'))
    
    if not can_delete:
        return render(request, "errors/403.html", status=403)
    
    context = _get_backup_context(request)
    return render(request, 'db_admin/pages/clean.html', context)


# ==============================================================================
# [REMOVED] rollback_restore_page, execute_rollback_restore, validate_rollback_order
# 已移除：数据修改找回功能 (D03) - 2026-01-27
# ==============================================================================


@require_POST
@login_required
def create_backup(request):
    if not check_feature_switch("db_admin"):
        return HttpResponse(f"<div class='alert alert-secondary'>{_('该功能已被管理员关闭')}</div>", status=403)

    if not check_perm(request.user, 'module.db_admin.backup.create'):
        return HttpResponse(f"<div class='alert alert-danger'>{_('权限不足')}</div>", status=403)
    
    tag = request.POST.get("tag", "").strip()
    
    # [Security] L0-L4 Check
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_create_backup')
    if not passed:
        return HttpResponse(f"<div class='alert alert-danger mb-0'>{reason}</div>")

    service = DatabaseService()
    success, msg = service.create_backup(tag)
    
    if success:
        audit_logger.info(f"手动创建备份: {tag}", extra={"user": request.user.username, "func": "DB:Backup", "action": "CREATE_BACKUP"})
        return HttpResponse(f"<div class='alert alert-success mb-0'><i class='fas fa-check-circle me-2'></i> {_('备份成功')}: {msg}</div>")
    else:
        audit_logger.error(f"创建备份失败: {msg}", extra={"user": request.user.username, "func": "DB:Backup"})
        return HttpResponse(f"<div class='alert alert-danger mb-0'><i class='fas fa-times-circle me-2'></i> {_('备份失败')}: {msg}</div>")

@require_POST
@login_required
def restore_backup(request):
    if not check_feature_switch("db_admin"):
         return HttpResponse(f"<div class='alert alert-secondary'>{_('该功能已被管理员关闭')}</div>", status=403)

    if not request.user.is_superuser: # High risk, enforce superuser for now or specific perm
         return HttpResponse(f"<div class='alert alert-danger'>{_('仅限超级管理员操作')}</div>", status=403)
         
    # [Security] L0-L4 Check
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_restore_db')
    if not passed:
        return HttpResponse(f"<div class='alert alert-danger mb-0'>{reason}</div>")
         
    filename = request.POST.get("filename")
    if not filename: return HttpResponse(f"<div class='alert alert-warning mb-0'>{_('未选择文件')}</div>")
    
    service = DatabaseService()
    
    success, msg = service.restore_backup_with_progress(filename, callback=None) # No progress callback in simple view yet
    
    if success:
         audit_logger.warning(f"恢复数据库成功: {filename}", extra={"user": request.user.username, "func": "DB:Restore", "action": "RESTORE_DB"})
         return HttpResponse(f"<div class='alert alert-success mb-0'>{_('恢复成功')}</div>")
    else:
         audit_logger.error(f"恢复数据库失败: {filename}", extra={"user": request.user.username, "func": "DB:Restore", "details": msg})
         return HttpResponse(f"<div class='alert alert-danger mb-0'>${_('恢复失败')}: {msg}</div>")

@require_POST
@login_required
def delete_backup(request):
    if not check_feature_switch("db_admin"):
         return HttpResponse(f"<div class='alert alert-secondary'>{_('功能已关闭')}</div>", status=403)

    if not check_perm(request.user, 'module.db_admin.backup.manage'):
         return HttpResponse(_("权限不足"), status=403)
         
    filename = request.POST.get("filename")
    
    # [Security] L0-L4 Check
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_delete_backup')
    if not passed:
        return HttpResponse(f"<div class='alert alert-danger mb-0'>{reason}</div>")

    service = DatabaseService()
    success, msg = service.delete_backup(filename)
    
    if success:
        audit_logger.info(f"删除备份文件: {filename}", extra={"user": request.user.username, "func": "DB:Manage", "action": "DELETE_BACKUP"})
        # Trigger Reload to update the table
        response = HttpResponse("")
        response['HX-Refresh'] = 'true'
        return response
    else:
        return HttpResponse(f"<div class='alert alert-danger mb-0'>${_('删除失败')}: {msg}</div>")

@require_POST
@login_required
def batch_delete_backups(request):
    if not check_feature_switch("db_admin"):
         return HttpResponse(f"<div class='alert alert-secondary'>{_('功能已关闭')}</div>", status=403)

    if not check_perm(request.user, 'module.db_admin.backup.manage'):
         return HttpResponse(_("权限不足"), status=403)
         
    filenames = request.POST.getlist("selected_files")
    if not filenames:
        return HttpResponse(f"<div class='alert alert-warning mb-0'>{_('未选择文件')}</div>")

    # [Security] L0-L4 Check (Reuse same key as single delete)
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_delete_backup')
    if not passed:
        return HttpResponse(f"<div class='alert alert-danger mb-0'>{reason}</div>")

    service = DatabaseService()
    # Assuming delete_batch_backups returns (success_count, fail_count, errors)
    success, fail, errors = service.delete_batch_backups(filenames)
    
    if fail == 0:
        audit_logger.info(f"批量删除备份: {success} 个文件", extra={"user": request.user.username, "func": "DB:Manage", "action": "BATCH_DELETE"})
        # Full Success - Trigger Refresh but STAY on current tab if possible
        response = HttpResponse(f"<div class='alert alert-success mb-0'>${_('批量删除完成')}: {success} ${_('个文件已删除')}</div>")
        response['HX-Trigger'] = 'batchDeleteSuccess'
        return response
    else:
        err_msg = "<br>".join(errors)
        audit_logger.warning(f"批量删除部分失败: {fail} 失败", extra={"user": request.user.username, "func": "DB:Manage"})
        return HttpResponse(f"<div class='alert alert-warning mb-0'>${_('部分删除完成')}: {success} ${_('成功')}, {fail} ${_('失败')}.<br>{err_msg}</div>")

@require_POST
@login_required
def clean_data(request):
    if not check_feature_switch("db_admin"):
         return HttpResponse(f"<div class='alert alert-secondary'>{_('功能已关闭')}</div>", status=403)

    if not check_perm(request.user, 'module.db_admin.cleanup.delete'):
         return HttpResponse(f"<div class='alert alert-danger'>{_('权限不足')}</div>", status=403)
         
    start = request.POST.get("start_date")
    end = request.POST.get("end_date")
    reason_text = request.POST.get("reason")
    
    # [Security] L0-L4 Check
    passed, reason_sec = SecurityPolicyManager.verify_action_request(request, 'btn_clean_data')
    if not passed:
        return HttpResponse(f"<div class='alert alert-danger mb-0'>{reason_sec}</div>")
    
    if not all([start, end, reason_text]):
         return HttpResponse(f"<div class='alert alert-warning mb-0'>{_('请填写所有必填项')}</div>")
    
    try:
        s_date = datetime.datetime.strptime(start, '%Y-%m-%d').date()
        e_date = datetime.datetime.strptime(end, '%Y-%m-%d').date()
    except ValueError:
        return HttpResponse(f"<div class='alert alert-danger mb-0'>{_('日期格式错误')}</div>")
         
    service = DatabaseService()
    
    success, msg = service.delete_business_data_by_range(s_date, e_date, reason_text)
    
    if success:
         audit_logger.warning(
             f"数据清洗: {start} 至 {end}", 
             extra={
                 "user": request.user.username, 
                 "func": "DB:Clean", 
                 "action": "CLEAN_DATA",
                 "details": f"Reason: {reason_text}"
             }
         )
         return HttpResponse(f"<div class='alert alert-success mb-0'>${_('数据清洗完成 (已自动创建回滚点)')}:<br><pre>{msg}</pre></div>")
    else:
         return HttpResponse(f"<div class='alert alert-danger mb-0'>${_('清洗失败')}: {msg}</div>")


@require_POST
@login_required
def clean_verify(request):
    """
    数据清洗预验证 API (Step 2)
    返回指定日期范围内的数据统计（脱敏输出）。
    
    Input: start_date, end_date (POST)
    Output: JSON { sales_count, inventory_count, has_data, message }
    
    ⚠️ 严格脱敏：不返回表名、列名、SQL、路径等内部信息
    """
    if not check_feature_switch("db_admin"):
        return JsonResponse({'error': _('功能已关闭'), 'has_data': False}, status=403)

    if not request.user.is_superuser:
        return JsonResponse({'error': _('权限不足'), 'has_data': False}, status=403)
    
    start = request.POST.get("start_date")
    end = request.POST.get("end_date")
    
    if not start or not end:
        return JsonResponse({'error': _('请填写日期范围'), 'has_data': False}, status=400)
    
    try:
        s_date = datetime.datetime.strptime(start, '%Y-%m-%d').date()
        e_date = datetime.datetime.strptime(end, '%Y-%m-%d').date()
    except ValueError:
        return JsonResponse({'error': _('日期格式错误'), 'has_data': False}, status=400)
    
    if s_date > e_date:
        return JsonResponse({'error': _('开始日期不能晚于结束日期'), 'has_data': False}, status=400)
    
    service = DatabaseService()
    result = service.count_business_data_by_range(s_date, e_date)
    
    # 构建脱敏响应
    total = result['sales_count'] + result['inventory_count']
    
    if result['has_data']:
        message = f"在 {start} 至 {end} 期间，共发现 {total} 条可清理记录。"
    else:
        message = f"在 {start} 至 {end} 期间，未发现可清理数据。"
    
    return JsonResponse({
        'sales_count': result['sales_count'],
        'inventory_count': result['inventory_count'],
        'total': total,
        'has_data': result['has_data'],
        'message': message,
        'date_range': f"{start} ~ {end}"
    })


# ==============================================================================
# Data Modification (Wizard & COGS)
# ==============================================================================

from backend.core.services.data_manager import DataManager
from backend.core.sys.lock_manager import LockManager

@login_required(login_url='web_ui:login')
def data_change_view(request):
    """
    Main entry point for Data Modification Center (数据修改中心).
    This is an independent first-level module.
    """
    if not check_feature_switch("data_ops"):
         return render(request, "errors/403.html", status=403)

    # [P0-2 Fix] Check SPECIFIC leaf permissions only
    perms = AuthService.get_permissions(request.user.username)
    
    # User can access hub if they have ANY sub-permission
    has_inv = bool(perms.get('module.inventory.stocktake.modify'))
    has_cogs = bool(perms.get('module.products.catalog.cogs'))
    has_create = bool(perms.get('module.products.catalog.create'))
    
    can_access = request.user.is_superuser or has_inv or has_cogs or has_create
    
    if not can_access:
        return render(request, "errors/403.html", status=403)
         
    # Init context with Step 1 data (Inventory Columns)
    mgr = DataManager()
    cols = mgr.get_inventory_columns()
    
    # Sub-feature permissions - Each checks its SPECIFIC leaf permission
    user_context = {
        "can_update_inv": request.user.is_superuser or has_inv,
        "can_drop_col": request.user.is_superuser or has_inv,
        "can_update_cogs": request.user.is_superuser or has_cogs,
        "can_create_sku": request.user.is_superuser or has_create,
    }

    # Hub Items - 显示所有，通过 has_access 控制点击行为
    hub_items = [
        {
            'id': 'inv',
            'name': '库存修改向导',
            'icon': 'fas fa-magic',
            'desc': '按步骤修正单品库存或删除整列数据。',
            'has_access': user_context["can_update_inv"] or user_context["can_drop_col"]
        },
        {
            'id': 'cogs',
            'name': '产品数据维护',
            'icon': 'fas fa-file-invoice-dollar',
            'desc': '批量编辑产品成本、运费及分类信息。',
            'has_access': user_context["can_update_cogs"]
        },
        {
            'id': 'create',
            'name': '新增产品',
            'icon': 'fas fa-plus-circle',
            'desc': '创建新的产品档案并初始化库存记录。',
            'has_access': user_context["can_create_sku"]
        }
    ]

    context = {
        "hub_items": hub_items,
        "inv_columns": cols,
        "step": 1,
        "perms": user_context,
        "is_superuser": request.user.is_superuser
    }
    return render(request, "db_admin/data_change.html", context)

# --- Inventory Wizard ---

@require_POST
@login_required
def wizard_step_2(request):
    """
    Step 2: Action Selection (Modify vs Delete)
    """
    selected_date = request.POST.get("selected_date")
    if not selected_date:
        return HttpResponse(f"<div class='alert alert-warning'>{_('请先选择日期列')}</div>")
        
    context = {
        "selected_date": selected_date,
        "step": 2
    }
    # We can perform lock check here if we want strict wizard, but typically check at action
    return render(request, "db_admin/partials/wizard_step_2.html", context)

@require_POST
@login_required
def wizard_step_3_form(request):
    """
    Step 3: Render the specific form (Modify Single or Delete Col)
    """
    selected_date = request.POST.get("selected_date")
    action_type = request.POST.get("action_type") # 'MODIFY' or 'DELETE'
    
    context = {
        "selected_date": selected_date,
        "action_type": action_type,
        "step": 3
    }
    
    if action_type == "MODIFY":
        mgr = DataManager()
        context["skus"] = mgr.get_all_skus()
        return render(request, "db_admin/partials/wizard_step_3_modify.html", context)
        
    elif action_type == "DELETE":
        return render(request, "db_admin/partials/wizard_step_3_delete.html", context)
        
    return HttpResponse(_("无效的操作类型"))

@require_POST
@login_required
def execute_inventory_update(request):
    """
    Final Execute: Update Single Inventory Value
    [ISO] Security Gate + Rollback Backup + Lock Management
    """
    if not check_feature_switch("data_ops"):
        return HttpResponse(f"<div class='alert alert-secondary'>{_('功能禁用')}</div>", status=403)

    if not check_perm(request.user, 'module.inventory.stocktake.modify'):
        return HttpResponse(f"<div class='alert alert-danger'>{_('权限不足')}</div>", status=403)
    
    # [Security] L3 Gate
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_update_single_inv')
    if not passed:
        return HttpResponse(f"<div class='alert alert-danger'><i class='fas fa-lock me-2'></i>{reason}</div>")
        
    date_col = request.POST.get("selected_date")
    sku = request.POST.get("sku")
    new_qty = request.POST.get("new_qty")
    
    if not all([date_col, sku, new_qty]):
         return HttpResponse(f"<div class='alert alert-danger'>{_('缺少必要参数')}</div>")
         
    user = request.user.username
    # Lock Check
    locked, msg = LockManager.acquire_lock('Data_Inventory', user, f"Modify {sku}")
    if not locked:
         return HttpResponse(f"<div class='alert alert-warning'>{msg}</div>")
         
    try:
        mgr = DataManager()
        success, res_msg = mgr.update_inventory_qty(date_col, sku, int(new_qty))
        if success:
             audit_logger.info(
                 f"修改库存: {sku} -> {new_qty} ({date_col})",
                 extra={"user": user, "func": "DB:Inv", "action": "UPDATE_INV", "details": f"Date: {date_col}, SKU: {sku}"}
             )
             return HttpResponse(f"<div class='alert alert-success'><i class='fas fa-check-circle me-2'></i>{res_msg}</div>")
        else:
             return HttpResponse(f"<div class='alert alert-danger'>{res_msg}</div>")
    except ValueError:
        return HttpResponse(f"<div class='alert alert-danger'>{_('无效的数量格式')}</div>")
    finally:
        LockManager.release_lock('Data_Inventory', user)

@require_POST
@login_required
def execute_column_delete(request):
    """
    Final Execute: Delete Column
    [ISO] Security Gate (L4) + Rollback Backup + Lock Management
    """
    if not check_feature_switch("data_ops"):
        return HttpResponse(f"<div class='alert alert-secondary'>{_('功能禁用')}</div>", status=403)

    if not check_perm(request.user, 'module.inventory.stocktake.modify'):
        return HttpResponse(f"<div class='alert alert-danger'>{_('权限不足')}</div>", status=403)
    
    # [Security] L4 Gate (High Risk)
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_drop_inv_col')
    if not passed:
        return HttpResponse(f"<div class='alert alert-danger'><i class='fas fa-shield-alt me-2'></i>{reason}</div>")

    date_col = request.POST.get("selected_date")
    reason_text = request.POST.get("reason")
    
    if not all([date_col, reason_text]):
         return HttpResponse(f"<div class='alert alert-danger'>{_('缺少必要参数')}</div>")

    user = request.user.username
    locked, msg = LockManager.acquire_lock('Data_Inventory', user, f"Delete Col {date_col}")
    if not locked:
         return HttpResponse(f"<div class='alert alert-warning'>{msg}</div>")
         
    try:
        mgr = DataManager()
        success, res_msg = mgr.drop_inventory_column(date_col, reason_text)
        if success:
             audit_logger.warning(
                 f"删除库存列: {date_col}",
                 extra={"user": user, "func": "DB:Inv", "action": "DELETE_COL", "details": f"Reason: {reason_text}"}
             )
             return HttpResponse(f"<div class='alert alert-success'><i class='fas fa-check-circle me-2'></i>{res_msg}</div>")
        else:
             return HttpResponse(f"<div class='alert alert-danger'>{res_msg}</div>")
    finally:
        LockManager.release_lock('Data_Inventory', user)

@require_POST
@login_required
def get_sku_current_val(request):
    """
    HTMX: Get current value for a SKU/Date tuple
    """
    date_col = request.POST.get("selected_date")
    sku = request.POST.get("sku")
    
    if not date_col or not sku: return HttpResponse("-")
    
    mgr = DataManager()
    val = mgr.get_inventory_value(date_col, sku)
    return HttpResponse(str(val))


# ==============================================================================
# COGS Maintenance
# ==============================================================================

@login_required
def cogs_load_table(request):
    """
    HTMX: Load COGS data table for editing
    """
    if not check_feature_switch("data_ops"):
        return HttpResponse(f"<div class='alert alert-secondary'>{_('功能禁用')}</div>", status=403)

    mgr = DataManager()
    df = mgr.get_cogs_data()
    
    # Convert to list of dicts for template
    records = df.to_dict('records') if not df.empty else []
    
    # Get dropdown options
    categories = mgr.get_distinct_options("Category")
    subcategories = mgr.get_distinct_options("SubCategory")
    types = mgr.get_distinct_options("Type")
    
    context = {
        "records": records,
        "categories": categories,
        "subcategories": subcategories,
        "types": types,
    }
    return render(request, "db_admin/partials/cogs_table_edit.html", context)


@login_required
def cogs_load_table_only(request):
    """
    HTMX: Load COGS data table (pure table only, no buttons/security UI)
    用于产品数据维护向导 Step1
    """
    if not check_feature_switch("data_ops"):
        return HttpResponse(f"<div class='alert alert-secondary'>{_('功能禁用')}</div>", status=403)

    mgr = DataManager()
    df = mgr.get_cogs_data()
    
    # Convert to list of dicts for template
    records = df.to_dict('records') if not df.empty else []
    
    # Get dropdown options
    categories = mgr.get_distinct_options("Category")
    subcategories = mgr.get_distinct_options("SubCategory")
    types = mgr.get_distinct_options("Type")
    
    context = {
        "records": records,
        "categories": categories,
        "subcategories": subcategories,
        "types": types,
    }
    return render(request, "db_admin/partials/cogs_table_only.html", context)

@require_POST
@login_required
def cogs_batch_update(request):
    """
    Execute: Batch update COGS data
    [ISO] Security Gate (L3) + Rollback Backup
    """
    if not check_feature_switch("data_ops"):
        return HttpResponse(f"<div class='alert alert-secondary'>{_('功能禁用')}</div>", status=403)

    if not check_perm(request.user, 'module.products.catalog.cogs'):
        return HttpResponse(f"<div class='alert alert-danger'>{_('权限不足')}</div>", status=403)
    
    # [Security] L3 Gate
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_batch_update_cogs')
    if not passed:
        return HttpResponse(f"<div class='alert alert-danger'><i class='fas fa-lock me-2'></i>{reason}</div>")

    # Parse JSON data from request
    import json
    try:
        data_json = request.POST.get("cogs_data")
        if not data_json:
            return HttpResponse(f"<div class='alert alert-warning'>{_('未提供数据')}</div>")
        
        records = json.loads(data_json)
        if not records:
            return HttpResponse(f"<div class='alert alert-warning'>{_('数据为空')}</div>")
            
        df_new = pd.DataFrame(records)
    except json.JSONDecodeError:
        return HttpResponse(f"<div class='alert alert-danger'>{_('JSON 解析失败')}</div>")
    
    user = request.user.username
    locked, msg = LockManager.acquire_lock('Data_COGS', user, "Batch Update COGS")
    if not locked:
        return HttpResponse(f"<div class='alert alert-warning'>{msg}</div>")
    
    try:
        mgr = DataManager()
        result = mgr.update_cogs_smart(df_new)
        
        # Handle 2 or 3 return values
        if len(result) == 3:
            success, res_msg, _ = result
        else:
            success, res_msg = result
            
        if success:
            audit_logger.info(
                f"批量更新COGS: {len(records)} 条记录",
                extra={"user": user, "func": "DB:COGS", "action": "UPDATE_COGS"}
            )
            return HttpResponse(f"<div class='alert alert-success'><i class='fas fa-check-circle me-2'></i>{res_msg}</div>")
        else:
            return HttpResponse(f"<div class='alert alert-danger'>{res_msg}</div>")
    finally:
        LockManager.release_lock('Data_COGS', user)


@require_POST
@login_required
def cogs_create_skus(request):
    """
    Execute: Create new SKUs
    [ISO] Security Gate (L3) + Rollback Backup
    """
    if not check_feature_switch("data_ops"):
        return HttpResponse(f"<div class='alert alert-secondary'>{_('功能禁用')}</div>", status=403)

    if not check_perm(request.user, 'module.products.catalog.create'):
        return HttpResponse(f"<div class='alert alert-danger'>{_('权限不足')}</div>", status=403)
    
    # [Security] L3 Gate
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_create_skus')
    if not passed:
        return HttpResponse(f"<div class='alert alert-danger'><i class='fas fa-lock me-2'></i>{reason}</div>")

    # Parse JSON data
    import json
    try:
        data_json = request.POST.get("sku_data")
        if not data_json:
            return HttpResponse(f"<div class='alert alert-warning'>{_('未提供数据')}</div>")
        
        records = json.loads(data_json)
        if not records:
            return HttpResponse(f"<div class='alert alert-warning'>{_('数据为空')}</div>")
        
        # [Security] 强制 SKU 转大写，防止绕过前端校验
        for row in records:
            if "SKU" in row:
                row["SKU"] = str(row["SKU"]).strip().upper()
    except json.JSONDecodeError:
        return HttpResponse(f"<div class='alert alert-danger'>{_('JSON 解析失败')}</div>")
    
    user = request.user.username
    locked, msg = LockManager.acquire_lock('Data_COGS', user, "Create SKUs")
    if not locked:
        return HttpResponse(f"<div class='alert alert-warning'>{msg}</div>")
    
    try:
        mgr = DataManager()
        success, res_msg = mgr.batch_create_skus(records)
        if success:
            audit_logger.info(
                f"批量创建SKU: {len(records)} 个",
                extra={"user": user, "func": "DB:COGS", "action": "CREATE_SKU"}
            )
            return HttpResponse(f"<div class='alert alert-success'><i class='fas fa-check-circle me-2'></i>{res_msg}</div>")
        else:
            return HttpResponse(f"<div class='alert alert-danger'>{res_msg}</div>")
    finally:
        LockManager.release_lock('Data_COGS', user)


@login_required
def cogs_get_form(request):
    """
    HTMX: Load empty SKU creation form
    """
    import json
    mgr = DataManager()
    categories = mgr.get_distinct_options("Category")
    subcategories = mgr.get_distinct_options("SubCategory")
    types = mgr.get_distinct_options("Type")
    
    # Get existing SKUs for duplicate check (使用专门的方法获取所有 SKU)
    existing_skus = mgr.get_all_cogs_skus()
    
    context = {
        "categories_json": json.dumps(categories),
        "subcategories_json": json.dumps(subcategories),
        "types_json": json.dumps(types),
        "existing_skus_json": json.dumps(existing_skus),
    }
    return render(request, "db_admin/partials/cogs_table_create.html", context)




@login_required
def cogs_get_form_only(request):
    """
    HTMX: Load empty SKU creation form (pure form only, no buttons/security UI)
    用于新增产品向导 Step1
    """
    import json
    mgr = DataManager()
    categories = mgr.get_distinct_options("Category")
    subcategories = mgr.get_distinct_options("SubCategory")
    types = mgr.get_distinct_options("Type")
    
    # Get existing SKUs for duplicate check
    existing_skus = mgr.get_all_cogs_skus()
    
    context = {
        "categories": json.dumps(categories),
        "subcategories": json.dumps(subcategories),
        "types": json.dumps(types),
        "existing_skus": json.dumps(existing_skus),
    }
    return render(request, "db_admin/partials/cogs_create_form_only.html", context)
