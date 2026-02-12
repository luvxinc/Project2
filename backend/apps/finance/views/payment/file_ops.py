# File: backend/apps/finance/views/payment/file_ops.py
"""
物流付款 - 文件管理 API
"""
import json
import logging
import mimetypes
import os
from datetime import date as date_type
from pathlib import Path

from django.http import JsonResponse, FileResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.utils.translation import gettext as _

from core.components.db.client import DBClient
from core.services.security.policy_manager import SecurityPolicyManager

logger = logging.getLogger(__name__)


def _get_payment_file_dir(pmt_no: str) -> Path:
    """获取付款文件存储目录"""
    # 从 pmt_no 提取年份（格式：20260104_S01 或 2026-01-04_S01）
    if pmt_no and len(pmt_no) >= 4:
        # 兼容新旧格式
        if pmt_no[4] == '-':
            year = pmt_no[:4]  # 旧格式：2026-01-04_S01
        else:
            year = pmt_no[:4]  # 新格式：20260104_S01
    else:
        year = str(date_type.today().year)
    
    # 新路径：data/records/finance/logistic/{YYYY}/{pmt_no}/
    from backend.common.settings import settings
    base_dir = settings.DATA_DIR / 'records' / 'finance' / 'logistic' / year
    return base_dir / pmt_no


@login_required(login_url='web_ui:login')
@require_GET
def check_payment_files_api(request):
    """
    检查付款文件是否存在
    URL: GET /dashboard/finance/logistic/api/check_payment_files/?pmt_no=xxx
    """
    pmt_no = request.GET.get('pmt_no', '')
    if not pmt_no:
        return JsonResponse({'success': False, 'message': _('缺少 pmt_no')}, status=400)
    
    file_dir = _get_payment_file_dir(pmt_no)
    files = []
    
    if file_dir.exists():
        for f in file_dir.iterdir():
            if f.is_file() and not f.name.startswith('.'):
                files.append({
                    'filename': f.name,
                    'size': f.stat().st_size,
                    'year': pmt_no.split('-')[0]
                })
        # 按版本号排序
        files.sort(key=lambda x: x['filename'], reverse=True)
    
    return JsonResponse({
        'success': True,
        'data': {
            'has_file': len(files) > 0,
            'files': files
        }
    })


@login_required(login_url='web_ui:login')
@require_GET  
def get_payment_files_api(request):
    """
    获取付款文件列表
    URL: GET /dashboard/finance/logistic/api/get_payment_files/?pmt_no=xxx
    """
    pmt_no = request.GET.get('pmt_no', '')
    if not pmt_no:
        return JsonResponse({'success': False, 'message': _('缺少 pmt_no')}, status=400)
    
    file_dir = _get_payment_file_dir(pmt_no)
    files = []
    
    if file_dir.exists():
        for f in file_dir.iterdir():
            if f.is_file() and not f.name.startswith('.'):
                files.append({
                    'filename': f.name,
                    'size': f.stat().st_size,
                    'year': pmt_no.split('-')[0]
                })
        files.sort(key=lambda x: x['filename'], reverse=True)
    
    return JsonResponse({
        'success': True,
        'data': {
            'pmt_no': pmt_no,
            'files': files
        }
    })


@login_required(login_url='web_ui:login')
@require_POST
def upload_payment_file_api(request):
    """
    上传付款文件
    URL: POST /dashboard/finance/logistic/api/upload_payment_file/
    """
    pmt_no = request.POST.get('pmt_no', '')
    if not pmt_no:
        return JsonResponse({'success': False, 'message': _('缺少 pmt_no')}, status=400)
    
    upload_file = request.FILES.get('upload_file')
    if not upload_file:
        return JsonResponse({'success': False, 'message': _('未选择文件')}, status=400)
    
    # [Security Fix 2026-01-11] 添加密码验证
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'logistic_payment_file_upload')
    if not is_valid:
        return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
    
    try:
        file_dir = _get_payment_file_dir(pmt_no)
        file_dir.mkdir(parents=True, exist_ok=True)
        
        # 获取文件扩展名
        original_name = upload_file.name
        ext = original_name.split('.')[-1].lower() if '.' in original_name else 'pdf'
        
        # 计算版本号
        existing_files = list(file_dir.glob(f'{pmt_no}_Ver*'))
        max_ver = 0
        for f in existing_files:
            match = f.name.replace(pmt_no + '_Ver', '').split('.')[0]
            try:
                ver = int(match)
                if ver > max_ver:
                    max_ver = ver
            except ValueError:
                pass
        
        new_ver = max_ver + 1
        new_filename = f"{pmt_no}_Ver{str(new_ver).zfill(2)}.{ext}"
        file_path = file_dir / new_filename
        
        # 保存文件
        with open(file_path, 'wb') as f:
            for chunk in upload_file.chunks():
                f.write(chunk)
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"上传付款文件: {new_filename}", extra={
            "user": request.user.username,
            "func": "Finance:PaymentFile",
            "action": "UPLOAD",
            "target": pmt_no
        })
        
        return JsonResponse({
            'success': True,
            'message': _('文件上传成功'),
            'filename': new_filename
        })
        
    except Exception as e:
        logger.exception("上传付款文件失败")
        return JsonResponse({'success': False, 'message': _('上传失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def serve_payment_file_api(request):
    """
    提供付款文件下载/查看
    URL: GET /dashboard/finance/logistic/api/serve_payment_file/?pmt_no=xxx&filename=xxx
    """
    pmt_no = request.GET.get('pmt_no', '').strip()
    filename = request.GET.get('filename', '').strip()
    
    if not pmt_no or not filename:
        return JsonResponse({'success': False, 'message': _('缺少参数')}, status=400)
    
    try:
        file_dir = _get_payment_file_dir(pmt_no)
        filepath = file_dir / filename
        
        # 安全检查：确保文件名以 pmt_no 开头
        if not filename.startswith(pmt_no.replace('-', '')):
            # 兼容旧格式（带连字符）
            if not filename.startswith(pmt_no):
                return JsonResponse({'success': False, 'message': _('无效的文件名')}, status=400)
        
        if not filepath.exists():
            return JsonResponse({'success': False, 'message': _('文件不存在')}, status=404)
        
        # 获取 MIME 类型
        content_type, _ = mimetypes.guess_type(str(filepath))
        if content_type is None:
            ext = filepath.suffix.lower()
            special_mimes = {
                '.heic': 'image/heic',
                '.heif': 'image/heif',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.xls': 'application/vnd.ms-excel',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.doc': 'application/msword',
                '.csv': 'text/csv',
            }
            content_type = special_mimes.get(ext, 'application/octet-stream')
        
        response = FileResponse(open(filepath, 'rb'), content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        response['X-Frame-Options'] = 'SAMEORIGIN'
        response['Content-Security-Policy'] = "frame-ancestors 'self'"
        return response
        
    except Exception as e:
        logger.exception("获取付款文件失败")
        return JsonResponse({'success': False, 'message': _('获取失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def delete_payment_file_api(request):
    """
    删除付款文件
    URL: POST /dashboard/finance/logistic/api/delete_payment_file/
    需要密码验证
    """
    try:
        data = json.loads(request.body)
        pmt_no = data.get('pmt_no', '').strip()
        filename = data.get('filename', '').strip()
        
        if not pmt_no or not filename:
            return JsonResponse({'success': False, 'message': _('缺少参数')}, status=400)
        
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'logistic_payment_file_delete')
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg}, status=403)
        
        file_dir = _get_payment_file_dir(pmt_no)
        filepath = file_dir / filename
        
        # 安全检查
        if not filename.startswith(pmt_no.replace('-', '')):
            if not filename.startswith(pmt_no):
                return JsonResponse({'success': False, 'message': _('无效的文件名')}, status=400)
        
        if not filepath.exists():
            return JsonResponse({'success': False, 'message': _('文件不存在')}, status=404)
        
        # 删除文件
        filepath.unlink()
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"删除付款文件: {filename}", extra={
            "user": request.user.username,
            "func": "Finance:PaymentFile",
            "action": "DELETE",
            "target": pmt_no
        })
        
        return JsonResponse({
            'success': True,
            'message': _('文件 {filename} 已删除').format(filename=filename)
        })
        
    except Exception as e:
        logger.exception("删除付款文件失败")
        return JsonResponse({'success': False, 'message': _('删除失败: {error}').format(error=str(e))}, status=500)
