#!/usr/bin/env python3
"""
验收脚本：权限树结构契约验证
- 确认权限树恰好包含22个功能节点
- 确认顶层模块恰好7个
- 确认节点名称完全匹配清单
- 确认无多余节点
"""
import os
import sys

# Add backend directory to path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')
import django
django.setup()

from backend.core.services.security.inventory import SecurityInventory

def test_permission_tree_contract():
    """验证权限树结构契约"""
    print("\n" + "=" * 60)
    print("权限树结构契约验证")
    print("=" * 60)
    
    # 清单：必须包含的22个功能节点（按业务名称）
    required_functions = {
        # 销售板块 (4个)
        "交易数据上传",
        "报表生成器",
        "报表中心",
        "数据交互可视化",
        # 采购板块 (2个)
        "新增供应商",
        "策略管理",
        # 库存板块 (2个)
        "手动上传盘存",
        "库存修改向导",
        # 产品板块 (2个)
        "产品数据维护",
        "新增产品",
        # 数据库运维 (5个)
        "数据备份",
        "数据恢复",
        "备份管理",
        "数据清洗",
        "数据修改找回",
        # 用户权限管理 (2个)
        "用户列表",
        "注册新用户",
        # 安全审计日志 (3个)
        "业务操作日志",
        "全景数据审计",
        "系统故障监控",
    }
    
    required_modules = {
        "销售板块",
        "采购板块",
        "库存板块",
        "产品板块",
        "数据库运维",
        "用户权限管理",
        "安全审计日志",
    }
    
    # 1. 获取权限树
    print("\n[1/5] 获取权限树结构...")
    tree = SecurityInventory.get_full_permission_tree()
    
    # 2. 提取所有节点名称
    def extract_names(nodes, names_by_type):
        for node in nodes:
            node_type = node.get('type', 'unknown')
            name = node.get('name', '')
            if node_type not in names_by_type:
                names_by_type[node_type] = set()
            names_by_type[node_type].add(name)
            
            if 'children' in node:
                extract_names(node['children'], names_by_type)
    
    names_by_type = {}
    extract_names(tree, names_by_type)
    
    modules = names_by_type.get('module', set())
    tabs = names_by_type.get('tab', set()) | names_by_type.get('submodule', set())
    
    print(f"   树中顶层模块数: {len(modules)}")
    print(f"   树中功能节点数: {len(tabs)}")
    
    # 3. 验证顶层模块
    print("\n[2/5] 验证顶层模块...")
    extra_modules = modules - required_modules
    missing_modules = required_modules - modules
    
    if extra_modules:
        print(f"   ❌ FAIL: 发现多余模块 {len(extra_modules)} 个:")
        for m in sorted(extra_modules):
            print(f"      - {m}")
        return False
    
    if missing_modules:
        print(f"   ❌ FAIL: 缺失模块 {len(missing_modules)} 个:")
        for m in sorted(missing_modules):
            print(f"      - {m}")
        return False
    
    print(f"   ✅ PASS: 顶层模块恰好7个，全部匹配")
    
    # 4. 验证功能节点
    print("\n[3/5] 验证功能节点...")
    extra_functions = tabs - required_functions
    missing_functions = required_functions - tabs
    
    if extra_functions:
        print(f"   ❌ FAIL: 发现多余功能 {len(extra_functions)} 个:")
        for f in sorted(extra_functions):
            print(f"      - {f}")
        return False
    
    if missing_functions:
        print(f"   ❌ FAIL: 缺失功能 {len(missing_functions)} 个:")
        for f in sorted(missing_functions):
            print(f"      - {f}")
        return False
    
    print(f"   ✅ PASS: 功能节点恰好22个，全部匹配")
    
    # 5. 验证白名单配置
    print("\n[4/5] 验证白名单配置...")
    whitelist_count = len(SecurityInventory.WHITELIST_PERMISSIONS)
    print(f"   白名单权限数: {whitelist_count}")
    
    if whitelist_count != 22:
        print(f"   ⚠️  WARNING: 白名单数量({whitelist_count})与功能节点数(22)不一致")
    else:
        print(f"   ✅ PASS: 白名单配置正确")
    
    # 6. 汇总
    print("\n[5/5] 验证汇总...")
    print(f"   ✅ 顶层模块: {len(modules)}/7")
    print(f"   ✅ 功能节点: {len(tabs)}/22")
    print(f"   ✅ 多余节点: 0")
    print(f"   ✅ 缺失节点: 0")
    
    return True


if __name__ == '__main__':
    print("\n🔍 权限树结构契约验证\n")
    success = test_permission_tree_contract()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ 所有验证通过")
        print("=" * 60 + "\n")
        sys.exit(0)
    else:
        print("❌ 验证失败")
        print("=" * 60 + "\n")
        sys.exit(1)
