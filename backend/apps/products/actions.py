# File: backend/apps/products/actions.py
"""
产品板块 Actions - 处理 POST 请求
包含条形码生成、下载、清空等操作
"""

import json
import zipfile
import io
from pathlib import Path

from django.http import HttpResponse, JsonResponse, FileResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.utils.translation import gettext as _

from core.services.auth.service import AuthService
from core.services.security.policy_manager import SecurityPolicyManager
from backend.core.sys.logger import get_logger
from backend.apps.audit.core.dto import LogStatus, LogType

from .services.barcode_generator import BarcodeGeneratorService, get_barcode_output_dir

logger = get_logger("ProductActions")


def _check_perm(user, perm_key: str) -> bool:
    """检查用户是否有精确的权限 key"""
    if user.is_superuser:
        return True
    user_perms = AuthService.get_permissions(user.username)
    return perm_key in user_perms


@login_required(login_url='web_ui:login')
@require_GET
def sku_list_api(request):
    """
    获取SKU列表 (用于采购订单商品录入的自动完成)
    
    Returns:
        JSON: {success: true, sku_list: ['SKU1', 'SKU2', ...]}
    """
    from core.components.db.client import DBClient
    
    try:
        df = DBClient.read_df("SELECT DISTINCT SKU FROM Data_COGS ORDER BY SKU")
        if not df.empty:
            sku_list = df['SKU'].dropna().tolist()
        else:
            sku_list = []
        
        return JsonResponse({
            'success': True,
            'sku_list': sku_list
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': str(e),
            'sku_list': []
        })


@login_required(login_url='web_ui:login')
@require_POST
def generate_barcode(request):
    """
    生成条形码 PDF
    
    POST 参数:
    - barcode_data: JSON 字符串，格式 [{"sku": "ABC", "qty_per_box": 10, "box_per_ctn": 5}, ...]
    - sec_code_l0, sec_code_l3: 安全验证码
    """
    # 权限检查
    if not _check_perm(request.user, 'module.products.barcode.generate'):
        logger.warning(
            "条形码生成权限不足",
            extra={
                "action": "生成条形码",
                "status": LogStatus.FAIL_PERM,
                "root_cause": "缺少 module.products.barcode.generate 权限"
            }
        )
        return JsonResponse({
            "success": False,
            "message": _("您没有生成条形码的权限")
        }, status=403)
    
    # 安全策略验证
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, "btn_generate_barcode")
    if not is_valid:
        logger.warning(
            f"条形码生成安全验证失败: {msg}",
            extra={
                "action": "生成条形码",
                "status": LogStatus.FAIL_PERM,
                "root_cause": msg
            }
        )
        return JsonResponse({
            "success": False,
            "message": msg
        }, status=403)
    
    # 解析数据
    try:
        barcode_data_str = request.POST.get("barcode_data", "[]")
        barcode_data = json.loads(barcode_data_str)
        
        if not isinstance(barcode_data, list) or len(barcode_data) == 0:
            return JsonResponse({
                "success": False,
                "message": _("请提供有效的条形码数据")
            }, status=400)
            
    except json.JSONDecodeError:
        return JsonResponse({
            "success": False,
            "message": _("条形码数据格式错误")
        }, status=400)
    
    # 调用服务生成条形码
    username = request.user.username
    
    # [关键] 生成前先清空之前的 PDF 文件
    BarcodeGeneratorService.clear_user_barcodes(username)
    
    success_list, fail_list = BarcodeGeneratorService.generate_batch(barcode_data, username)
    
    # 获取生成后的文件列表
    files = BarcodeGeneratorService.list_user_barcodes(username)
    
    return JsonResponse({
        "success": True,
        "message": _("生成完成: 成功 {success} 个, 失败 {fail} 个").format(success=len(success_list), fail=len(fail_list)),
        "data": {
            "success_count": len(success_list),
            "fail_count": len(fail_list),
            "success_items": success_list,
            "fail_items": fail_list,
            "files": files
        }
    })


@login_required(login_url='web_ui:login')
@require_GET
def download_barcode(request, filename: str):
    """
    下载单个条形码 PDF
    
    URL 参数:
    - filename: 文件的相对路径 (相对于用户 barcode 目录，可以包含子目录如 "SKU/4->5.pdf")
    """
    if not _check_perm(request.user, 'module.products.barcode.generate'):
        return HttpResponse(_("无权限"), status=403)
    
    username = request.user.username
    output_dir = get_barcode_output_dir(username)
    
    # [关键] filename 可能包含子目录路径 (如 "5100/5425-5475B32/4->5.pdf")
    # 使用 Path 安全地解析
    file_path = output_dir / filename
    
    if not file_path.exists() or not file_path.is_file():
        return HttpResponse(_("文件不存在"), status=404)
    
    # 安全检查: 确保文件在输出目录内 (防止路径遍历攻击)
    try:
        file_path.resolve().relative_to(output_dir.resolve())
    except ValueError:
        return HttpResponse(_("非法路径"), status=403)
    
    # 计算 display_name: 从路径中提取 SKU 和 qty->ctn
    relative_path = file_path.relative_to(output_dir)
    sku_parts = list(relative_path.parts[:-1])
    sku = "/".join(sku_parts) if sku_parts else "UNKNOWN"
    qty_ctn = file_path.stem
    display_name = f"{sku}.{qty_ctn}.pdf"
    
    logger.info(
        f"下载条形码文件: {display_name}",
        extra={
            "action": "下载条形码",
            "target": sku,  # 原始 SKU (含 "/" 原样记录)
            "status": LogStatus.SUCCESS,
            "log_type": LogType.REGULAR
        }
    )
    
    # 检查是否为内联预览模式
    inline_mode = request.GET.get('inline', '0') == '1'
    
    from urllib.parse import quote
    encoded_filename = quote(display_name, safe='')
    ascii_fallback = display_name.replace("/", "_")
    
    response = FileResponse(
        open(file_path, 'rb'),
        content_type='application/pdf',
    )
    
    if inline_mode:
        # 内联模式：浏览器直接显示 PDF
        response['Content-Disposition'] = f"inline; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_filename}"
    else:
        # 下载模式：强制下载
        response['Content-Disposition'] = f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_filename}"
    
    return response


@login_required(login_url='web_ui:login')
@require_GET
def download_all_barcodes(request):
    """
    打包下载所有条形码 PDF (ZIP)
    
    ZIP 内部结构:
    - SKU/qty->ctn.pdf (保留 SKU 作为目录结构)
    """
    if not _check_perm(request.user, 'module.products.barcode.generate'):
        return HttpResponse(_("无权限"), status=403)
    
    username = request.user.username
    output_dir = get_barcode_output_dir(username)
    
    # [关键] 递归获取所有 PDF 文件
    pdf_files = list(output_dir.rglob("*.pdf"))
    
    if not pdf_files:
        return HttpResponse(_("没有可下载的文件"), status=404)
    
    # 创建内存中的 ZIP 文件
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for pdf_path in pdf_files:
            # 使用相对路径作为 ZIP 条目名 (保留 SKU 目录结构)
            # 例如: "5100/5425-5475B32/4->5.pdf"
            relative_path = pdf_path.relative_to(output_dir)
            zip_file.write(pdf_path, str(relative_path))
    
    zip_buffer.seek(0)
    
    logger.info(
        f"批量下载条形码: {len(pdf_files)} 个文件",
        extra={
            "action": "批量下载条形码",
            "target": f"{len(pdf_files)} 个文件",
            "status": LogStatus.SUCCESS,
            "log_type": LogType.REGULAR
        }
    )
    
    response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="barcodes_{username}.zip"'
    return response


@login_required(login_url='web_ui:login')
@require_POST
def clear_barcodes(request):
    """
    清空用户的所有条形码文件
    """
    if not _check_perm(request.user, 'module.products.barcode.generate'):
        return JsonResponse({
            "success": False,
            "message": _("您没有操作权限")
        }, status=403)
    
    username = request.user.username
    count = BarcodeGeneratorService.clear_user_barcodes(username)
    
    return JsonResponse({
        "success": True,
        "message": _("已清空 {count} 个文件").format(count=count),
        "data": {"deleted_count": count}
    })


@login_required(login_url='web_ui:login')
@require_GET
def view_barcode(request, filename: str):
    """
    PDF 查看页面 (使用 PDF.js 渲染)
    
    URL 参数:
    - filename: 文件的相对路径 (相对于用户 barcode 目录)
    """
    from django.shortcuts import render
    
    if not _check_perm(request.user, 'module.products.barcode.generate'):
        return HttpResponse(_("无权限"), status=403)
    
    username = request.user.username
    output_dir = get_barcode_output_dir(username)
    file_path = output_dir / filename
    
    if not file_path.exists() or not file_path.is_file():
        return HttpResponse(_("文件不存在"), status=404)
    
    # 安全检查
    try:
        file_path.resolve().relative_to(output_dir.resolve())
    except ValueError:
        return HttpResponse(_("非法路径"), status=403)
    
    # 计算 display_name
    relative_path = file_path.relative_to(output_dir)
    sku_parts = list(relative_path.parts[:-1])
    sku = "/".join(sku_parts) if sku_parts else "UNKNOWN"
    qty_ctn = file_path.stem
    display_name = f"{sku}.{qty_ctn}.pdf"
    
    # 文件大小格式化
    size_bytes = file_path.stat().st_size
    if size_bytes < 1024:
        file_size = f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        file_size = f"{size_bytes / 1024:.1f} KB"
    else:
        file_size = f"{size_bytes / (1024 * 1024):.2f} MB"
    
    # PDF URL (使用 inline 模式)
    from urllib.parse import quote
    encoded_path = "/".join(quote(p, safe='') for p in relative_path.parts)
    pdf_url = f"/dashboard/products/barcode/download/{encoded_path}?inline=1"
    download_url = f"/dashboard/products/barcode/download/{encoded_path}"
    
    return render(request, "products/pages/barcode_viewer.html", {
        "filename": filename,
        "display_name": display_name,
        "file_size": file_size,
        "pdf_url": pdf_url,
        "download_url": download_url,
    })
