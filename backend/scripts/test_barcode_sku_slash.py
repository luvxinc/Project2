#!/usr/bin/env python3
"""
条形码生成器单元测试 - 验证 SKU 含 "/" 的情况
"""
import os
import sys
from pathlib import Path

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
project_root = os.path.dirname(backend_dir)
sys.path.insert(0, backend_dir)
sys.path.insert(0, project_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')

# PyMySQL 伪装
import pymysql
pymysql.install_as_MySQLdb()
import MySQLdb
if hasattr(MySQLdb, 'version_info') and MySQLdb.version_info < (2, 2, 1):
    setattr(MySQLdb, 'version_info', (2, 2, 1, 'final', 0))
    setattr(MySQLdb, '__version__', '2.2.1')

import django
django.setup()

from apps.products.services.barcode_generator import BarcodeGeneratorService, get_barcode_output_dir


def test_sku_with_slash():
    """测试 SKU 含 "/" 的情况"""
    print("=" * 70)
    print("Test: SKU with forward slash '/'")
    print("=" * 70)
    
    test_username = '__test_barcode__'
    test_items = [
        {'sku': 'A/B', 'qty_per_box': 1, 'box_per_ctn': 2},
        {'sku': '5100/5425-5475B32', 'qty_per_box': 4, 'box_per_ctn': 5},
        {'sku': 'NORMAL_SKU', 'qty_per_box': 10, 'box_per_ctn': 6}
    ]
    
    success_list, fail_list = BarcodeGeneratorService.generate_batch(test_items, test_username)
    
    print(f"\nResults: {len(success_list)} success, {len(fail_list)} fail")
    
    # 验证
    all_passed = True
    
    # 检查 SKU 含 "/" 的文件是否存在
    for item in success_list:
        sku = item['sku']
        real_path = Path(item['real_path'])
        display_name = item['display_name']
        
        if not real_path.exists():
            print(f"  ❌ FAIL: {sku} - file does not exist: {real_path}")
            all_passed = False
            continue
        
        # 验证 display_name 格式
        expected_display = f"{sku}.{item['qty_per_box']}->{item['box_per_ctn']}.pdf"
        if display_name != expected_display:
            print(f"  ❌ FAIL: {sku} - display_name mismatch: {display_name} != {expected_display}")
            all_passed = False
            continue
        
        # 验证 real_path 结构 (SKU 应该是目录)
        output_dir = get_barcode_output_dir(test_username)
        relative = real_path.relative_to(output_dir)
        sku_from_path = "/".join(relative.parts[:-1])
        if sku_from_path != sku:
            print(f"  ❌ FAIL: {sku} - SKU in path mismatch: {sku_from_path}")
            all_passed = False
            continue
        
        print(f"  ✅ PASS: {sku}")
    
    for item in fail_list:
        print(f"  ❌ FAIL: {item['sku']} - {item['error']}")
        all_passed = False
    
    # 清理
    BarcodeGeneratorService.clear_user_barcodes(test_username)
    
    # 验证清理后目录应该为空或不存在
    output_dir = get_barcode_output_dir(test_username)
    remaining = list(output_dir.rglob("*.pdf"))
    if remaining:
        print(f"  ❌ FAIL: {len(remaining)} files remaining after clear")
        all_passed = False
    else:
        print(f"  ✅ PASS: All files cleaned up")
    
    print("\n" + "=" * 70)
    if all_passed:
        print("✅ ALL TESTS PASSED")
        return True
    else:
        print("❌ SOME TESTS FAILED")
        return False


if __name__ == '__main__':
    success = test_sku_with_slash()
    sys.exit(0 if success else 1)
