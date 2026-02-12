#!/usr/bin/env python3
"""
企业级 i18n 完整性审计脚本
Enterprise-Grade Internationalization Audit Script

审计范围:
1. 后端 Python (JsonResponse/HttpResponse 中的硬编码中文)
2. 前端 HTML 模板 ({% trans %} 标签加载检查)
3. JavaScript (alert/confirm 硬编码检查)
4. 翻译文件完整性 (zh.json vs en.json 键值对齐)
5. 遗漏的 gettext 导入

执行: python3 aid/audit/enterprise_i18n_audit.py
"""

import os
import re
import json
from pathlib import Path
from collections import defaultdict

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent.parent
BACKEND_DIR = PROJECT_ROOT / 'backend'
APPS_DIR = BACKEND_DIR / 'apps'
TEMPLATES_DIR = BACKEND_DIR / 'templates'
STATIC_DIR = BACKEND_DIR / 'static'
I18N_DIR = STATIC_DIR / 'i18n'

# 中文字符正则
CHINESE_REGEX = re.compile(r'[\u4e00-\u9fff]')

# 审计结果
audit_results = {
    'backend_hardcoded': [],      # 后端硬编码中文
    'template_missing_load': [],  # 模板未加载 i18n
    'template_trans_usage': [],   # 模板使用 trans 但可能未加载
    'js_hardcoded': [],           # JS 硬编码中文
    'translation_mismatch': [],   # 翻译键不匹配
    'missing_gettext_import': [], # 缺少 gettext 导入
    'backup_files': [],           # 备份文件残留
}

stats = {
    'py_files_scanned': 0,
    'html_files_scanned': 0,
    'js_files_scanned': 0,
    'total_issues': 0,
}


def scan_python_files():
    """扫描 Python 文件中的硬编码中文"""
    print("\n[1/6] 扫描后端 Python 文件...")
    
    # 需要检查的模式
    patterns = [
        (r"JsonResponse\s*\(\s*\{[^}]*['\"][^'\"]*[\u4e00-\u9fff]+", "JsonResponse 硬编码"),
        (r"HttpResponse\s*\([^)]*[\u4e00-\u9fff]+", "HttpResponse 硬编码"),
        (r"['\"](message|error|msg)['\"]:\s*['\"][^'\"]*[\u4e00-\u9fff]+", "消息字段硬编码"),
    ]
    
    for py_file in APPS_DIR.rglob('*.py'):
        if '.bak' in str(py_file) or '__pycache__' in str(py_file):
            if '.bak' in str(py_file):
                audit_results['backup_files'].append(str(py_file))
            continue
            
        stats['py_files_scanned'] += 1
        
        try:
            content = py_file.read_text(encoding='utf-8')
            lines = content.split('\n')
            
            # 检查是否有 gettext 导入
            has_gettext = 'from django.utils.translation import' in content or 'gettext' in content
            uses_underscore = re.search(r"_\s*\(['\"]", content)
            
            for i, line in enumerate(lines, 1):
                # 跳过注释和文档字符串
                stripped = line.strip()
                if stripped.startswith('#') or stripped.startswith('"""') or stripped.startswith("'''"):
                    continue
                
                # 检查 JsonResponse/HttpResponse 中的中文
                for pattern, desc in patterns:
                    if re.search(pattern, line):
                        # 检查是否已用 _() 包裹
                        if not re.search(r"_\s*\(['\"]", line):
                            audit_results['backend_hardcoded'].append({
                                'file': str(py_file.relative_to(PROJECT_ROOT)),
                                'line': i,
                                'type': desc,
                                'content': line.strip()[:100]
                            })
                            
            # 检查使用了 _() 但未导入 gettext
            if uses_underscore and not has_gettext:
                audit_results['missing_gettext_import'].append(str(py_file.relative_to(PROJECT_ROOT)))
                
        except Exception as e:
            print(f"  ⚠️ 无法读取: {py_file} - {e}")


def scan_templates():
    """扫描 HTML 模板文件"""
    print("\n[2/6] 扫描前端 HTML 模板...")
    
    for html_file in TEMPLATES_DIR.rglob('*.html'):
        if '.bak' in str(html_file):
            audit_results['backup_files'].append(str(html_file))
            continue
            
        stats['html_files_scanned'] += 1
        
        try:
            content = html_file.read_text(encoding='utf-8')
            
            # 检查是否使用了 {% trans %} 标签
            uses_trans = '{% trans' in content or '{% blocktrans' in content
            
            # 检查是否加载了 i18n
            has_load_i18n = '{% load i18n' in content or "{% load 'i18n'" in content
            
            # 如果使用了 trans 但没有加载 i18n
            if uses_trans and not has_load_i18n:
                # 检查是否继承了基础模板（基础模板可能已加载）
                extends_base = '{% extends' in content
                if not extends_base:
                    audit_results['template_missing_load'].append({
                        'file': str(html_file.relative_to(PROJECT_ROOT)),
                        'reason': '使用了 trans 标签但未加载 i18n'
                    })
                else:
                    # 继承了模板，检查父模板
                    audit_results['template_trans_usage'].append({
                        'file': str(html_file.relative_to(PROJECT_ROOT)),
                        'note': '继承模板，需确认父模板已加载 i18n'
                    })
                    
        except Exception as e:
            print(f"  ⚠️ 无法读取: {html_file} - {e}")


def scan_javascript():
    """扫描 JavaScript 文件中的硬编码中文"""
    print("\n[3/6] 扫描 JavaScript 文件...")
    
    # 排除的目录
    exclude_dirs = {'vendor', 'lib', 'plugins', 'node_modules'}
    
    for js_file in STATIC_DIR.rglob('*.js'):
        if any(exc in str(js_file) for exc in exclude_dirs):
            continue
            
        stats['js_files_scanned'] += 1
        
        try:
            content = js_file.read_text(encoding='utf-8')
            lines = content.split('\n')
            
            for i, line in enumerate(lines, 1):
                # 跳过注释
                if line.strip().startswith('//'):
                    continue
                    
                # 检查 alert/confirm 中的中文
                if re.search(r"(alert|confirm)\s*\([^)]*[\u4e00-\u9fff]+", line):
                    if 'i18n.t(' not in line and "{% trans" not in line:
                        audit_results['js_hardcoded'].append({
                            'file': str(js_file.relative_to(PROJECT_ROOT)),
                            'line': i,
                            'content': line.strip()[:100]
                        })
                        
        except Exception as e:
            print(f"  ⚠️ 无法读取: {js_file} - {e}")


def scan_embedded_js_in_templates():
    """扫描嵌入在 HTML 模板中的 JavaScript"""
    print("\n[4/6] 扫描模板内嵌 JavaScript...")
    
    for html_file in TEMPLATES_DIR.rglob('*.html'):
        if '.bak' in str(html_file):
            continue
            
        try:
            content = html_file.read_text(encoding='utf-8')
            
            # 查找 <script> 标签内容
            script_blocks = re.findall(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
            
            for block in script_blocks:
                lines = block.split('\n')
                for i, line in enumerate(lines, 1):
                    # 检查 alert/confirm 中的中文（未国际化）
                    if re.search(r"(alert|confirm)\s*\(['\"][^'\"]*[\u4e00-\u9fff]+", line):
                        if "{% trans" not in line and "i18n.t(" not in line:
                            audit_results['js_hardcoded'].append({
                                'file': str(html_file.relative_to(PROJECT_ROOT)),
                                'line': f"script block",
                                'content': line.strip()[:100]
                            })
                            
        except Exception as e:
            pass


def verify_translation_files():
    """验证翻译文件完整性"""
    print("\n[5/6] 验证翻译文件完整性...")
    
    zh_file = I18N_DIR / 'zh.json'
    en_file = I18N_DIR / 'en.json'
    
    if not zh_file.exists() or not en_file.exists():
        print("  ⚠️ 翻译文件不存在")
        return
        
    try:
        zh_data = json.loads(zh_file.read_text(encoding='utf-8'))
        en_data = json.loads(en_file.read_text(encoding='utf-8'))
        
        def get_all_keys(d, prefix=''):
            """递归获取所有键"""
            keys = set()
            for k, v in d.items():
                full_key = f"{prefix}.{k}" if prefix else k
                if isinstance(v, dict):
                    keys.update(get_all_keys(v, full_key))
                else:
                    keys.add(full_key)
            return keys
            
        zh_keys = get_all_keys(zh_data)
        en_keys = get_all_keys(en_data)
        
        # 找出不匹配的键
        only_in_zh = zh_keys - en_keys
        only_in_en = en_keys - zh_keys
        
        if only_in_zh:
            audit_results['translation_mismatch'].append({
                'type': '仅在 zh.json 中存在',
                'keys': list(only_in_zh)[:10]  # 只显示前10个
            })
            
        if only_in_en:
            audit_results['translation_mismatch'].append({
                'type': '仅在 en.json 中存在',
                'keys': list(only_in_en)[:10]
            })
            
        print(f"  ✅ zh.json: {len(zh_keys)} 键")
        print(f"  ✅ en.json: {len(en_keys)} 键")
        if only_in_zh or only_in_en:
            print(f"  ⚠️ 不匹配: zh独有 {len(only_in_zh)}, en独有 {len(only_in_en)}")
        else:
            print(f"  ✅ 键值完全对齐")
            
    except json.JSONDecodeError as e:
        print(f"  ❌ JSON 解析错误: {e}")


def cleanup_backup_files():
    """列出需要清理的备份文件"""
    print("\n[6/6] 检查备份文件残留...")
    
    for backup in APPS_DIR.rglob('*.bak'):
        audit_results['backup_files'].append(str(backup.relative_to(PROJECT_ROOT)))
        
    for backup in TEMPLATES_DIR.rglob('*.bak'):
        audit_results['backup_files'].append(str(backup.relative_to(PROJECT_ROOT)))


def generate_report():
    """生成审计报告"""
    print("\n" + "=" * 60)
    print("📋 企业级 i18n 审计报告")
    print("=" * 60)
    
    total_issues = 0
    
    # 1. 后端硬编码
    print(f"\n🔴 后端硬编码中文: {len(audit_results['backend_hardcoded'])} 处")
    for item in audit_results['backend_hardcoded'][:5]:
        print(f"   - {item['file']}:{item['line']}")
        print(f"     {item['content'][:80]}...")
    if len(audit_results['backend_hardcoded']) > 5:
        print(f"   ... 及其他 {len(audit_results['backend_hardcoded']) - 5} 处")
    total_issues += len(audit_results['backend_hardcoded'])
    
    # 2. 模板未加载 i18n
    print(f"\n🟡 模板未加载 i18n: {len(audit_results['template_missing_load'])} 处")
    for item in audit_results['template_missing_load'][:5]:
        print(f"   - {item['file']}: {item['reason']}")
    total_issues += len(audit_results['template_missing_load'])
    
    # 3. JS 硬编码
    print(f"\n🟡 JavaScript 硬编码: {len(audit_results['js_hardcoded'])} 处")
    for item in audit_results['js_hardcoded'][:5]:
        print(f"   - {item['file']}:{item['line']}")
    if len(audit_results['js_hardcoded']) > 5:
        print(f"   ... 及其他 {len(audit_results['js_hardcoded']) - 5} 处")
    total_issues += len(audit_results['js_hardcoded'])
    
    # 4. 翻译不匹配
    print(f"\n🟡 翻译键不匹配: {len(audit_results['translation_mismatch'])} 类")
    for item in audit_results['translation_mismatch']:
        print(f"   - {item['type']}: {item['keys'][:3]}...")
    total_issues += len(audit_results['translation_mismatch'])
    
    # 5. 缺少 gettext 导入
    print(f"\n🟠 缺少 gettext 导入: {len(audit_results['missing_gettext_import'])} 文件")
    for item in audit_results['missing_gettext_import'][:5]:
        print(f"   - {item}")
    total_issues += len(audit_results['missing_gettext_import'])
    
    # 6. 备份文件
    print(f"\n🔵 备份文件残留: {len(audit_results['backup_files'])} 个")
    for item in audit_results['backup_files'][:5]:
        print(f"   - {item}")
    
    # 统计
    print("\n" + "-" * 60)
    print("📊 审计统计")
    print("-" * 60)
    print(f"   Python 文件扫描: {stats['py_files_scanned']}")
    print(f"   HTML 模板扫描: {stats['html_files_scanned']}")
    print(f"   JavaScript 扫描: {stats['js_files_scanned']}")
    print(f"   总问题数: {total_issues}")
    
    # 评级
    print("\n" + "=" * 60)
    if total_issues == 0:
        print("🏆 审计结果: ✅ PASS (全部通过)")
    elif total_issues <= 5:
        print("📝 审计结果: 🟡 MINOR ISSUES (轻微问题)")
    elif total_issues <= 20:
        print("⚠️ 审计结果: 🟠 NEEDS ATTENTION (需要关注)")
    else:
        print("❌ 审计结果: 🔴 CRITICAL (严重问题)")
    print("=" * 60)
    
    return total_issues


def main():
    print("=" * 60)
    print("🔍 MGMT ERP 企业级 i18n 审计")
    print(f"   项目路径: {PROJECT_ROOT}")
    print("=" * 60)
    
    scan_python_files()
    scan_templates()
    scan_javascript()
    scan_embedded_js_in_templates()
    verify_translation_files()
    cleanup_backup_files()
    
    total_issues = generate_report()
    
    # 保存详细报告
    report_file = PROJECT_ROOT / 'aid' / 'audit' / 'i18n_enterprise_audit_report.json'
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(audit_results, f, ensure_ascii=False, indent=2)
    print(f"\n📄 详细报告已保存: {report_file}")
    
    return total_issues


if __name__ == '__main__':
    main()
