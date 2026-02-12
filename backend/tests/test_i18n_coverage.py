"""
i18n Coverage Tests for MGMT Platform
====================================

测试内容:
1. 所有 HTML 模板能正确加载
2. i18n JSON 文件有效
3. i18n 覆盖率达到阈值 (93%)
4. E2E 页面加载测试
"""

import json
import re
from pathlib import Path

from django.test import TestCase, Client
from django.template import engines
from django.contrib.auth import get_user_model


class I18nTemplateLoadTest(TestCase):
    """测试所有 HTML 模板能正确加载"""
    
    def test_all_templates_load_successfully(self):
        """验证所有 205 个模板无语法错误"""
        engine = engines['django']
        template_dir = Path('templates')
        errors = []
        count = 0
        
        for f in sorted(template_dir.rglob('*.html')):
            try:
                engine.get_template(str(f.relative_to('templates')))
                count += 1
            except Exception as e:
                errors.append(f"{f.name}: {str(e)[:100]}")
        
        self.assertEqual(errors, [], f"Template errors: {errors}")
        self.assertGreaterEqual(count, 200, f"Expected 200+ templates, found {count}")


class I18nJsonValidityTest(TestCase):
    """测试 i18n JSON 文件有效性"""
    
    def test_zh_json_valid(self):
        """验证 zh.json 是有效的 JSON"""
        with open('static/i18n/zh.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertIn('js', data, "zh.json should have 'js' module")
        self.assertIn('common', data, "zh.json should have 'common' module")
        self.assertGreater(len(data['js']), 300, f"JS module should have 300+ keys, found {len(data['js'])}")
    
    def test_en_json_valid(self):
        """验证 en.json 是有效的 JSON"""
        with open('static/i18n/en.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.assertIn('js', data, "en.json should have 'js' module")
        self.assertIn('common', data, "en.json should have 'common' module")
    
    def test_zh_en_key_parity(self):
        """验证 zh.json 和 en.json 的 js 模块 key 一致"""
        with open('static/i18n/zh.json', 'r', encoding='utf-8') as f:
            zh_data = json.load(f)
        with open('static/i18n/en.json', 'r', encoding='utf-8') as f:
            en_data = json.load(f)
        
        zh_js_keys = set(zh_data.get('js', {}).keys())
        en_js_keys = set(en_data.get('js', {}).keys())
        
        missing_in_en = zh_js_keys - en_js_keys
        missing_in_zh = en_js_keys - zh_js_keys
        
        self.assertEqual(missing_in_en, set(), f"Keys in zh but not in en: {missing_in_en}")
        self.assertEqual(missing_in_zh, set(), f"Keys in en but not in zh: {missing_in_zh}")


class I18nCoverageTest(TestCase):
    """测试 i18n 覆盖率"""
    
    def calculate_coverage(self):
        """计算实际覆盖率"""
        template_dir = Path('templates')
        covered = 0
        truly_remaining = 0
        
        for f in template_dir.rglob('*.html'):
            try:
                content = f.read_text(encoding='utf-8')
            except:
                continue
            
            lines = content.splitlines()
            in_script = False
            in_style = False
            in_jsdoc = False
            
            for i, line in enumerate(lines):
                if '<script' in line: in_script = True
                if '</script>' in line: 
                    in_script = False
                    in_jsdoc = False
                if '<style' in line: in_style = True
                if '</style>' in line: in_style = False
                if in_script and '/*' in line and '*/' not in line: in_jsdoc = True
                if '*/' in line: in_jsdoc = False
                
                if not re.search(r'[\u4e00-\u9fff]', line):
                    continue
                    
                stripped = line.strip()
                
                # 已覆盖
                if 'data-i18n' in line or '{% trans' in line or 'window.i18n' in line:
                    covered += 1
                    continue
                
                # 排除项
                if '<!--' in line or '{#' in line or in_style:
                    continue
                if stripped.startswith('/*') or stripped.startswith('*'):
                    continue
                if in_script:
                    if stripped.startswith('//') or in_jsdoc or 'console.' in line:
                        continue
                    if re.search(r'[;)}\]]\s*//.*[\u4e00-\u9fff]', line):
                        continue
                    if '`' in line and ('data-i18n' in line or '${' in line):
                        continue
                else:
                    if '{{' in line or stripped.startswith('{%'):
                        continue
                    if 'components/' in str(f):
                        continue
                    if 'class=' in line and not re.search(r'>\s*[\u4e00-\u9fff]', line):
                        continue
                    if i > 0 and 'data-i18n' in lines[i-1]:
                        continue
                if 'value=' in line and '<input' in line and 'filter' in line:
                    continue
                
                truly_remaining += 1
        
        total = covered + truly_remaining
        coverage = 100 * covered / total if total > 0 else 0
        return coverage, covered, truly_remaining
    
    def test_coverage_threshold(self):
        """验证覆盖率达到 93%"""
        coverage, covered, remaining = self.calculate_coverage()
        self.assertGreaterEqual(
            coverage, 93.0, 
            f"Coverage {coverage:.1f}% below 93% threshold. Covered: {covered}, Remaining: {remaining}"
        )


class I18nE2EPageLoadTest(TestCase):
    """E2E 页面加载测试"""
    
    def setUp(self):
        User = get_user_model()
        # 创建或获取超级用户
        self.user = User.objects.filter(is_superuser=True).first()
        if not self.user:
            self.user = User.objects.create_superuser(
                username='test_admin',
                password='testpass123'
            )
        self.client = Client()
        self.client.force_login(self.user)
    
    def test_hub_pages_load(self):
        """验证所有 Hub 页面加载"""
        hub_urls = [
            '/dashboard/purchase/',
            '/dashboard/finance/',
            '/dashboard/inventory/',
            '/dashboard/products/',
            '/dashboard/sales/',
            '/dashboard/user_admin/',
            '/dashboard/db_admin/',
        ]
        
        for url in hub_urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(
                    response.status_code, 200,
                    f"Hub page {url} returned {response.status_code}"
                )
    
    def test_all_linked_pages_load(self):
        """验证从 Hub 链接的所有页面加载"""
        hub_urls = [
            '/dashboard/purchase/',
            '/dashboard/finance/',
            '/dashboard/inventory/',
            '/dashboard/products/',
            '/dashboard/sales/',
            '/dashboard/user_admin/',
            '/dashboard/db_admin/',
        ]
        
        all_links = set()
        for hub in hub_urls:
            try:
                response = self.client.get(hub)
                if response.status_code == 200:
                    content = response.content.decode('utf-8')
                    links = re.findall(r'href="(/dashboard/[^"#]+)"', content)
                    all_links.update(links)
            except:
                pass
        
        passed = 0
        failed = []
        for url in sorted(all_links):
            try:
                response = self.client.get(url, follow=True)
                if response.status_code == 200:
                    passed += 1
                else:
                    failed.append(url)
            except Exception as e:
                failed.append(f"{url}: {e}")
        
        self.assertEqual(
            len(failed), 0,
            f"Failed pages: {failed[:10]}"
        )
        self.assertGreaterEqual(
            passed, 40,
            f"Expected 40+ pages, only {passed} passed"
        )
