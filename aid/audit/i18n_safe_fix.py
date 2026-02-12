#!/usr/bin/env python3
"""
i18n 精确修复脚本 - 仅处理简单的静态字符串
避免破坏 f-string 和复杂表达式
"""

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent

# 简单替换规则：只处理完整的静态字符串
SIMPLE_REPLACEMENTS = {
    'backend/apps/db_admin/views.py': [
        # HttpResponse 中的纯静态消息 - 只替换消息内容部分
        ('HttpResponse("<div class=\'alert alert-secondary\'>该功能已被管理员关闭 (Functional Switch)</div>"', 
         'HttpResponse(f"<div class=\'alert alert-secondary\'>{_(\'该功能已被管理员关闭\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-secondary\'>该功能已被管理员关闭</div>"',
         'HttpResponse(f"<div class=\'alert alert-secondary\'>{_(\'该功能已被管理员关闭\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-danger\'>权限不足</div>"',
         'HttpResponse(f"<div class=\'alert alert-danger\'>{_(\'权限不足\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-danger\'>仅限超级管理员操作</div>"',
         'HttpResponse(f"<div class=\'alert alert-danger\'>{_(\'仅限超级管理员操作\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-warning mb-0\'>未选择文件</div>"',
         'HttpResponse(f"<div class=\'alert alert-warning mb-0\'>{_(\'未选择文件\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-secondary\'>功能已关闭</div>"',
         'HttpResponse(f"<div class=\'alert alert-secondary\'>{_(\'功能已关闭\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-secondary\'>功能禁用</div>"',
         'HttpResponse(f"<div class=\'alert alert-secondary\'>{_(\'功能禁用\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-warning mb-0\'>请填写所有必填项</div>"',
         'HttpResponse(f"<div class=\'alert alert-warning mb-0\'>{_(\'请填写所有必填项\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-danger mb-0\'>日期格式错误</div>"',
         'HttpResponse(f"<div class=\'alert alert-danger mb-0\'>{_(\'日期格式错误\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-danger\'>缺少必要参数</div>"',
         'HttpResponse(f"<div class=\'alert alert-danger\'>{_(\'缺少必要参数\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-danger\'>无效的数量格式</div>"',
         'HttpResponse(f"<div class=\'alert alert-danger\'>{_(\'无效的数量格式\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-warning\'>未提供数据</div>"',
         'HttpResponse(f"<div class=\'alert alert-warning\'>{_(\'未提供数据\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-warning\'>数据为空</div>"',
         'HttpResponse(f"<div class=\'alert alert-warning\'>{_(\'数据为空\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-danger\'>JSON 解析失败</div>"',
         'HttpResponse(f"<div class=\'alert alert-danger\'>{_(\'JSON 解析失败\')}</div>"'),
        ('HttpResponse("<div class=\'alert alert-warning\'>请先选择日期列。</div>"',
         'HttpResponse(f"<div class=\'alert alert-warning\'>{_(\'请先选择日期列\')}</div>"'),
        ('HttpResponse("权限不足"',
         'HttpResponse(_("权限不足")'),
        ('HttpResponse("无效的操作类型")',
         'HttpResponse(_("无效的操作类型"))'),
        # JsonResponse 消息 - 这些应该已经被之前的脚本处理过，但确保覆盖
    ],
    'backend/apps/etl/views.py': [
        ("HttpResponse('<div class=\"alert alert-danger\">数据已过期，请重新上传</div>')",
         "HttpResponse(f'<div class=\"alert alert-danger\">{_(\"数据已过期，请重新上传\")}</div>')"),
        ("HttpResponse('<div class=\"alert alert-danger\">安全验证失败，请检查密码</div>', status=403)",
         "HttpResponse(f'<div class=\"alert alert-danger\">{_(\"安全验证失败，请检查密码\")}</div>', status=403)"),
    ],
    'backend/apps/reports/views.py': [
        ('HttpResponse("文件不存在", status=404)',
         'HttpResponse(_("文件不存在"), status=404)'),
        ("HttpResponse(\"<p class='text-danger'>文件不存在</p>\")",
         "HttpResponse(f\"<p class='text-danger'>{_('文件不存在')}</p>\")"),
    ],
    'backend/apps/user_admin/views/tabs.py': [
        ('HttpResponse("🔒 权限不足：仅超级管理员可见", status=403)',
         'HttpResponse(_("权限不足：仅超级管理员可见"), status=403)'),
    ],
}

GETTEXT_IMPORT = "from django.utils.translation import gettext as _"

def ensure_gettext_import(content: str) -> str:
    """确保文件有 gettext 导入"""
    if 'from django.utils.translation import gettext as _' in content:
        return content
    if 'from django.utils.translation import' in content:
        return content
    
    # 在导入区域添加
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
        original_content = content
        
        count = 0
        for old, new in replacements:
            if old in content:
                content = content.replace(old, new)
                count += 1
        
        if count > 0:
            content = ensure_gettext_import(content)
            file_path.write_text(content, encoding='utf-8')
            return (rel_path, count, "OK")
        else:
            return (rel_path, 0, "No matches")
            
    except Exception as e:
        return (rel_path, 0, str(e))


def main():
    print("=" * 60)
    print("🔧 i18n 精确修复脚本 (安全模式)")
    print("=" * 60)
    
    total_fixed = 0
    for rel_path, replacements in SIMPLE_REPLACEMENTS.items():
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
    
    # 验证语法
    print("\n验证语法...")
    import subprocess
    for rel_path in SIMPLE_REPLACEMENTS.keys():
        result = subprocess.run(
            ['python3', '-m', 'py_compile', str(PROJECT_ROOT / rel_path)],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"  ✅ {rel_path}")
        else:
            print(f"  ❌ {rel_path}: {result.stderr[:200]}")


if __name__ == '__main__':
    main()
