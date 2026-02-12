#!/usr/bin/env python3
"""
i18n 自动修复脚本
自动为后端 Python 文件添加 gettext 导入并包裹硬编码中文字符串
"""

import re
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
BACKEND_DIR = PROJECT_ROOT / 'backend'

# 需要处理的文件和替换规则
REPLACEMENTS = {
    'backend/apps/db_admin/views.py': [
        # JsonResponse 消息
        ('"功能已关闭"', '_("功能已关闭")'),
        ('"权限不足"', '_("权限不足")'),
        ('"密码验证失败"', '_("密码验证失败")'),
        ('"参数缺失"', '_("参数缺失")'),
        ('"无可用回档点"', '_("无可用回档点")'),
        ('"回档点不存在"', '_("回档点不存在")'),
        ('"必须先回档最近的操作"', '_("必须先回档最近的操作")'),
        ('"创建回滚点失败，回档已取消"', '_("创建回滚点失败，回档已取消")'),
        ('"回档成功"', '_("回档成功")'),
        ('"回档执行失败"', '_("回档执行失败")'),
        ('"回档执行异常"', '_("回档执行异常")'),
        ('"请填写日期范围"', '_("请填写日期范围")'),
        ('"日期格式错误"', '_("日期格式错误")'),
        ('"开始日期不能晚于结束日期"', '_("开始日期不能晚于结束日期")'),
        # HttpResponse 消息
        ("'该功能已被管理员关闭 (Functional Switch)'", "_('该功能已被管理员关闭')"),
        ("'该功能已被管理员关闭'", "_('该功能已被管理员关闭')"),
        ("'权限不足'", "_('权限不足')"),
        ("'仅限超级管理员操作'", "_('仅限超级管理员操作')"),
        ("'未选择文件'", "_('未选择文件')"),
        ("'恢复成功 (已自动创建回滚点)'", "_('恢复成功 (已自动创建回滚点)')"),
        ("'功能已关闭'", "_('功能已关闭')"),
        ("'请填写所有必填项'", "_('请填写所有必填项')"),
        ("'日期格式错误'", "_('日期格式错误')"),
        ("'功能禁用'", "_('功能禁用')"),
        ("'请先选择日期列。'", "_('请先选择日期列')"),
        ("'无效的操作类型'", "_('无效的操作类型')"),
        ("'缺少必要参数'", "_('缺少必要参数')"),
        ("'无效的数量格式'", "_('无效的数量格式')"),
        ("'未提供数据'", "_('未提供数据')"),
        ("'数据为空'", "_('数据为空')"),
        ("'JSON 解析失败'", "_('JSON 解析失败')"),
        # 动态消息需要特殊处理
    ],
    'backend/apps/etl/views.py': [
        ("'处理失败: '", "_('处理失败: ')"),
        ("'引擎错误: '", "_('引擎错误: ')"),
        ("'校验失败: '", "_('校验失败: ')"),
        ("'同步失败: '", "_('同步失败: ')"),
        ("'数据已过期，请重新上传'", "_('数据已过期，请重新上传')"),
        ("'安全验证失败，请检查密码'", "_('安全验证失败，请检查密码')"),
        ("'入库失败: '", "_('入库失败: ')"),
    ],
    'backend/apps/reports/views.py': [
        ('"文件不存在"', '_("文件不存在")'),
        ("'文件不存在'", "_('文件不存在')"),
    ],
    'backend/apps/user_admin/views/tabs.py': [
        ('"🔒 权限不足：仅超级管理员可见"', '_("权限不足：仅超级管理员可见")'),
    ],
    'backend/apps/products/services/barcode_generator.py': [
        ('"(空)"', '_("(空)")'),
        ('"SKU 不能为空"', '_("SKU 不能为空")'),
        ('"每盒个数必须是大于0的正整数"', '_("每盒个数必须是大于0的正整数")'),
        ('"每箱盒数必须是大于0的正整数"', '_("每箱盒数必须是大于0的正整数")'),
    ],
    'backend/apps/purchase/views/send_create/template.py': [
        ("'无法验证上传文件，请返回第一步重新下载模板：'", "_('无法验证上传文件，请返回第一步重新下载模板')"),
        ("'以下物流参数未填写：'", "_('以下物流参数未填写')"),
    ],
    'backend/apps/finance/views/deposit/api.py': [
        ("'文件删除成功'", "_('文件删除成功')"),
    ],
    'backend/apps/finance/views/prepay/api.py': [
        ("'预付款记录已恢复'", "_('预付款记录已恢复')"),
        ("'缺少流水号参数'", "_('缺少流水号参数')"),
        ("'缺少参数'", "_('缺少参数')"),
        ("'文件不存在'", "_('文件不存在')"),
        ("'非法文件路径'", "_('非法文件路径')"),
        ("'未选择文件'", "_('未选择文件')"),
        ("'文件大小超过限制'", "_('文件大小超过限制')"),
        ("'文件上传成功'", "_('文件上传成功')"),
        ("'文件删除成功'", "_('文件删除成功')"),
    ],
    'backend/apps/finance/views/po/api.py': [
        ("'付款记录不存在或已删除'", "_('付款记录不存在或已删除')"),
        ("'订单付款已删除'", "_('订单付款已删除')"),
    ],
}

GETTEXT_IMPORT = "from django.utils.translation import gettext as _"

def ensure_gettext_import(content: str) -> str:
    """确保文件有 gettext 导入"""
    if 'from django.utils.translation import gettext as _' in content:
        return content
    if 'from django.utils.translation import' in content:
        # 已有其他 translation 导入，检查是否有 gettext
        if 'gettext as _' not in content and 'gettext,' not in content:
            # 添加 gettext
            content = content.replace(
                'from django.utils.translation import',
                'from django.utils.translation import gettext as _, '
            )
        return content
    
    # 没有任何 translation 导入，添加到文件开头的导入区域
    lines = content.split('\n')
    insert_idx = 0
    for i, line in enumerate(lines):
        if line.startswith('import ') or line.startswith('from '):
            insert_idx = i + 1
        elif line.strip() and not line.startswith('#') and not line.startswith('"""'):
            break
    
    lines.insert(insert_idx, GETTEXT_IMPORT)
    return '\n'.join(lines)


def process_file(rel_path: str, replacements: list) -> tuple:
    """处理单个文件"""
    file_path = PROJECT_ROOT / rel_path
    if not file_path.exists():
        return (rel_path, 0, "File not found")
    
    try:
        content = file_path.read_text(encoding='utf-8')
        original = content
        
        # 执行替换
        count = 0
        for old, new in replacements:
            if old in content:
                content = content.replace(old, new)
                count += content.count(new) - original.count(new)
        
        if count > 0:
            # 确保有 gettext 导入
            content = ensure_gettext_import(content)
            file_path.write_text(content, encoding='utf-8')
            return (rel_path, count, "OK")
        else:
            return (rel_path, 0, "No matches")
            
    except Exception as e:
        return (rel_path, 0, str(e))


def main():
    print("=" * 60)
    print("🔧 i18n 自动修复脚本")
    print("=" * 60)
    
    total_fixed = 0
    for rel_path, replacements in REPLACEMENTS.items():
        path, count, status = process_file(rel_path, replacements)
        if count > 0:
            print(f"✅ {path}: {count} 处替换")
            total_fixed += count
        elif status == "No matches":
            print(f"⏭️  {path}: 已处理或无匹配")
        else:
            print(f"❌ {path}: {status}")
    
    print("-" * 60)
    print(f"总计修复: {total_fixed} 处")


if __name__ == '__main__':
    main()
