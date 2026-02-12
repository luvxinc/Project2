"""
订单管理 - 账单文件处理
"""
import logging

import os
import mimetypes
from pathlib import Path
from datetime import datetime
from django.http import JsonResponse, FileResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET, require_http_methods
from django.utils.translation import gettext as _

from ..hub import check_perm
from backend.common.settings import settings
from core.services.security.policy_manager import SecurityPolicyManager

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def upload_po_invoice_api(request):
    """
    上传厂商账单文件
    URL: /dashboard/purchase/api/po_mgmt/upload_invoice/
    POST multipart/form-data: { po_num, supplier_code, invoice_file }
    
    保存路径: data/po_invoices/{supplier_code}/{po_num}_invoice_Ver01.{ext}
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    # [Security Fix 2026-01-11] 添加密码验证
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_po_upload_invoice')
    if not is_valid:
        return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
    
    try:
        po_num = request.POST.get('po_num', '').strip()
        supplier_code = request.POST.get('supplier_code', '').strip()
        invoice_file = request.FILES.get('invoice_file')
        
        if not po_num:
            return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
        if not invoice_file:
            return JsonResponse({'success': False, 'message': _('未上传文件')}, status=400)
        
        # 获取文件扩展名
        original_name = invoice_file.name
        ext = os.path.splitext(original_name)[1].lower()
        
        # 从 po_num 解析年份（格式：XX20260104S01 -> 2026）
        year = '20' + po_num[2:4] if len(po_num) >= 4 else str(datetime.now().year)
        
        # 确定版本号（查找已存在的文件）
        # 新路径：data/records/purchase/po/{YYYY}/{supplier}/
        invoices_dir = settings.DATA_DIR / 'records' / 'purchase' / 'po' / year / supplier_code
        invoices_dir.mkdir(parents=True, exist_ok=True)
        
        # 查找现有版本（兼容 _V## 和 _Ver## 格式）
        version = 1
        existing_files = list(invoices_dir.glob(f"{po_num}_invoice_V*"))
        if existing_files:
            for f in existing_files:
                try:
                    ver_str = f.stem.split('_V')[-1]
                    ver_num = int(ver_str)
                    if ver_num >= version:
                        version = ver_num + 1
                except:
                    pass
        
        # 生成文件名（新格式：_V##）
        filename = f"{po_num}_invoice_V{str(version).zfill(2)}{ext}"
        filepath = invoices_dir / filename
        
        # 保存文件
        with open(filepath, 'wb') as f:
            for chunk in invoice_file.chunks():
                f.write(chunk)
        
        return JsonResponse({
            'success': True,
            'message': _('上传成功'),
            'filename': filename,
            'path': str(filepath.relative_to(settings.DATA_DIR))
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('上传失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_invoice_info_api(request):
    """
    获取订单账单文件信息
    URL: /dashboard/purchase/api/po_mgmt/invoice_info/?po_num=xxx
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    po_num = request.GET.get('po_num', '').strip()
    if not po_num:
        return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
    
    try:
        # 从po_num提取供应商代码（前两位字母）
        supplier_code = po_num[:2] if len(po_num) >= 2 else ''
        if not supplier_code:
            return JsonResponse({'success': False, 'message': _('无效的订单号')}, status=400)
        
        # 从 po_num 解析年份
        year = '20' + po_num[2:4] if len(po_num) >= 4 else str(datetime.now().year)
        
        # 新路径：data/records/purchase/po/{YYYY}/{supplier}/
        invoices_dir = settings.DATA_DIR / 'records' / 'purchase' / 'po' / year / supplier_code
        if not invoices_dir.exists():
            return JsonResponse({
                'success': True,
                'data': {
                    'has_file': False,
                    'files': []
                }
            })
        
        # 查找所有匹配的文件（兼容新旧格式）
        matching_files = list(invoices_dir.glob(f"{po_num}_invoice_V*"))
        if not matching_files:
            return JsonResponse({
                'success': True,
                'data': {
                    'has_file': False,
                    'files': []
                }
            })
        
        # 获取文件信息列表
        files_info = []
        for f in matching_files:
            try:
                stat = f.stat()
                files_info.append({
                    'filename': f.name,
                    'ext': f.suffix.lower(),
                    'size': stat.st_size,
                    'modified': stat.st_mtime
                })
            except:
                pass
        
        # 按版本号排序（降序）
        files_info.sort(key=lambda x: x['filename'], reverse=True)
        
        return JsonResponse({
            'success': True,
            'data': {
                'has_file': len(files_info) > 0,
                'latest_file': files_info[0]['filename'] if files_info else None,
                'files': files_info
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取文件信息失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def serve_invoice_file_api(request):
    """
    提供账单文件下载/查看
    URL: /dashboard/purchase/api/po_mgmt/serve_invoice/?po_num=xxx&filename=xxx
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    po_num = request.GET.get('po_num', '').strip()
    filename = request.GET.get('filename', '').strip()
    
    if not po_num or not filename:
        return JsonResponse({'success': False, 'message': _('缺少参数')}, status=400)
    
    try:
        # 从po_num提取供应商代码
        supplier_code = po_num[:2] if len(po_num) >= 2 else ''
        
        # 从 po_num 解析年份
        year = '20' + po_num[2:4] if len(po_num) >= 4 else str(datetime.now().year)
        
        # 新路径：data/records/purchase/po/{YYYY}/{supplier}/filename
        filepath = settings.DATA_DIR / 'records' / 'purchase' / 'po' / year / supplier_code / filename
        
        # 安全检查：确保文件名以po_num开头
        if not filename.startswith(po_num):
            return JsonResponse({'success': False, 'message': _('无效的文件名')}, status=400)
        
        if not filepath.exists():
            return JsonResponse({'success': False, 'message': _('文件不存在')}, status=404)
        
        # 获取MIME类型（包括特殊格式）
        content_type, _ = mimetypes.guess_type(str(filepath))
        if content_type is None:
            # 特殊格式的MIME类型映射
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
        
        # 返回文件
        response = FileResponse(open(filepath, 'rb'), content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        # 允许在同源iframe中显示
        response['X-Frame-Options'] = 'SAMEORIGIN'
        response['Content-Security-Policy'] = "frame-ancestors 'self'"
        return response
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取文件失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def delete_po_invoice_api(request):
    """
    删除订单账单文件
    URL: /dashboard/purchase/api/po_mgmt/delete_invoice/
    POST JSON: { po_num, filename }
    """
    import json
    
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': _('权限不足')}, status=403)
    
    try:
        data = json.loads(request.body)
        
        # [Security Fix 2026-01-11] 添加密码验证
        # 注意：对于 JSON body 请求，需要先解析 body 再验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_po_delete_invoice', data)
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
        po_num = data.get('po_num', '').strip()
        filename = data.get('filename', '').strip()
        
        if not po_num or not filename:
            return JsonResponse({'success': False, 'message': _('缺少参数')}, status=400)
        
        # 安全检查：确保文件名以po_num开头
        if not filename.startswith(po_num):
            return JsonResponse({'success': False, 'message': _('无效的文件名')}, status=400)
        
        # 从po_num提取供应商代码
        supplier_code = po_num[:2] if len(po_num) >= 2 else ''
        
        # 从 po_num 解析年份
        year = '20' + po_num[2:4] if len(po_num) >= 4 else str(datetime.now().year)
        
        # 新路径：data/records/purchase/po/{YYYY}/{supplier}/filename
        filepath = settings.DATA_DIR / 'records' / 'purchase' / 'po' / year / supplier_code / filename
        
        if not filepath.exists():
            return JsonResponse({'success': False, 'message': _('文件不存在')}, status=404)
        
        # 删除文件
        filepath.unlink()
        
        return JsonResponse({
            'success': True,
            'message': _('文件 {filename} 已删除').format(filename=filename)
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('删除失败: {error}').format(error=str(e))
        }, status=500)
