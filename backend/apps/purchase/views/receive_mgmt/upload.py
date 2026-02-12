"""
入库管理 - 入库文件上传
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
def upload_receive_file_api(request):
    """
    上传入库文件
    URL: /dashboard/purchase/api/receive_mgmt/upload_file/
    POST multipart/form-data: { logistic_num, receive_date, receive_file }
    
    保存路径: data/receiving/YYYY/YYYYMMDD_{logistic_num}_Ver##.{ext}
    
    命名规则:
    - YYYY: 入库日期的年份
    - YYYYMMDD: 入库日期
    - logistic_num: 物流单号
    - Ver##: 版本号，Ver01 表示第一个版本
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        logistic_num = request.POST.get('logistic_num', '').strip()
        receive_date = request.POST.get('receive_date', '').strip()
        receive_file = request.FILES.get('receive_file')
        
        if not logistic_num:
            return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
        if not receive_date:
            return JsonResponse({'success': False, 'message': _('缺少入库日期')}, status=400)
        if not receive_file:
            return JsonResponse({'success': False, 'message': _('未上传文件')}, status=400)
        
        # 解析入库日期
        try:
            date_obj = datetime.strptime(receive_date, '%Y-%m-%d')
            year = date_obj.strftime('%Y')
            date_prefix = date_obj.strftime('%Y%m%d')
        except ValueError:
            return JsonResponse({'success': False, 'message': _('入库日期格式错误，应为 YYYY-MM-DD')}, status=400)
        
        # 获取文件扩展名
        original_name = receive_file.name
        ext = os.path.splitext(original_name)[1].lower()
        
        # 新路径：data/records/purchase/receive/{YYYY}/
        receiving_dir = settings.DATA_DIR / 'records' / 'purchase' / 'receive' / year
        receiving_dir.mkdir(parents=True, exist_ok=True)
        
        # 查找现有版本（兼容新旧格式：_V## 和 _Ver##）
        file_pattern = f"{date_prefix}_{logistic_num}_V*"
        existing_files = list(receiving_dir.glob(file_pattern))
        
        version = 1
        if existing_files:
            for f in existing_files:
                try:
                    stem = f.stem
                    ver_part = stem.split('_V')[-1]
                    ver_num = int(ver_part)
                    if ver_num >= version:
                        version = ver_num + 1
                except:
                    pass
        
        # 生成文件名（新格式：_V##）
        filename = f"{date_prefix}_{logistic_num}_V{str(version).zfill(2)}{ext}"
        filepath = receiving_dir / filename
        
        # 保存文件
        with open(filepath, 'wb') as f:
            for chunk in receive_file.chunks():
                f.write(chunk)
        
        return JsonResponse({
            'success': True,
            'message': _('上传成功'),
            'filename': filename,
            'version': version,
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
def get_receive_file_info_api(request):
    """
    获取入库文件信息
    URL: /dashboard/purchase/api/receive_mgmt/file_info/?logistic_num=xxx&receive_date=xxxx-xx-xx
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '').strip()
    receive_date = request.GET.get('receive_date', '').strip()
    
    if not logistic_num:
        return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
    if not receive_date:
        return JsonResponse({'success': False, 'message': _('缺少入库日期')}, status=400)
    
    try:
        # 解析入库日期
        try:
            date_obj = datetime.strptime(receive_date, '%Y-%m-%d')
            year = date_obj.strftime('%Y')
            date_prefix = date_obj.strftime('%Y%m%d')
        except ValueError:
            return JsonResponse({'success': False, 'message': _('入库日期格式错误')}, status=400)
        
        # 新路径：data/records/purchase/receive/{YYYY}/
        receiving_dir = settings.DATA_DIR / 'records' / 'purchase' / 'receive' / year
        if not receiving_dir.exists():
            return JsonResponse({
                'success': True,
                'data': {
                    'has_file': False,
                    'files': []
                }
            })
        
        # 查找所有匹配的文件（兼容新旧格式）
        file_pattern = f"{date_prefix}_{logistic_num}_V*"
        matching_files = list(receiving_dir.glob(file_pattern))
        
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
                    'modified': stat.st_mtime,
                    'year': year
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
def serve_receive_file_api(request):
    """
    提供入库文件下载/查看
    URL: /dashboard/purchase/api/receive_mgmt/serve_file/?filename=xxx&year=xxxx
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    filename = request.GET.get('filename', '').strip()
    year = request.GET.get('year', '').strip()
    
    if not filename or not year:
        return JsonResponse({'success': False, 'message': _('缺少参数')}, status=400)
    
    try:
        # 新路径：data/records/purchase/receive/{YYYY}/filename
        filepath = settings.DATA_DIR / 'records' / 'purchase' / 'receive' / year / filename
        
        # 安全检查：确保文件名格式正确（兼容新旧格式）
        if not filename.startswith('20') or ('_V' not in filename):
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
def delete_receive_file_api(request):
    """
    删除入库文件
    URL: /dashboard/purchase/api/receive_mgmt/delete_file/
    POST JSON: { filename, year }
    """
    import json
    
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': _('权限不足')}, status=403)
    
    try:
        data = json.loads(request.body)
        
        # [Security Fix 2026-01-11] 添加密码验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_receive_delete_file', data)
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
        
        filename = data.get('filename', '').strip()
        year = data.get('year', '').strip()
        
        if not filename or not year:
            return JsonResponse({'success': False, 'message': _('缺少参数')}, status=400)
        
        # 安全检查：确保文件名格式正确（兼容新旧格式）
        if not filename.startswith('20') or ('_V' not in filename):
            return JsonResponse({'success': False, 'message': _('无效的文件名')}, status=400)
        
        # 新路径：data/records/purchase/receive/{YYYY}/filename
        filepath = settings.DATA_DIR / 'records' / 'purchase' / 'receive' / year / filename
        
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
