#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验收脚本: verify_purchase_audit_log_presence.py
目的: 静态检查采购模块已补齐 audit_logger 调用

验收标准:
- supplier.py 存在 get_audit_logger 导入
- add_supplier 函数存在 audit_logger.info 和 audit_logger.error
- modify_supplier_strategy 函数存在 audit_logger.info 和 audit_logger.error
- extra 包含必填字段: user, func, action, details
"""

import os
import sys
import re

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PASS_COUNT = 0
FAIL_COUNT = 0

def check(label: str, condition: bool, detail: str = ""):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        print(f"  ✓ {label}")
        PASS_COUNT += 1
    else:
        print(f"  ✗ {label}: {detail}")
        FAIL_COUNT += 1


def main():
    global PASS_COUNT, FAIL_COUNT
    
    print("=" * 60)
    print("验收脚本: 采购模块 Audit Log 补齐验证")
    print("=" * 60)
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    supplier_path = os.path.join(base_dir, "apps", "purchase", "views", "supplier.py")
    
    with open(supplier_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # ========================================
    # 测试 1: 检查导入
    # ========================================
    print("\n[1] 检查 audit_logger 导入")
    
    check("存在 get_audit_logger 导入", "get_audit_logger" in content, "未找到 get_audit_logger 导入")
    check("存在 audit_logger 实例化", "audit_logger = get_audit_logger()" in content, "未找到 audit_logger 实例化")
    
    # ========================================
    # 测试 2: 检查 add_supplier 日志
    # ========================================
    print("\n[2] 检查 add_supplier 函数日志")
    
    # 使用正则找到 add_supplier 函数范围
    add_supplier_match = re.search(r'def add_supplier\(.*?\n(?=\n@|\nclass |\Z)', content, re.DOTALL)
    if add_supplier_match:
        add_supplier_code = add_supplier_match.group()
        check("add_supplier 存在 audit_logger.info", "audit_logger.info" in add_supplier_code, "缺少成功日志")
        check("add_supplier 存在 audit_logger.error", "audit_logger.error" in add_supplier_code, "缺少失败日志")
        check("add_supplier 包含 CREATE_SUPPLIER action", "CREATE_SUPPLIER" in add_supplier_code, "缺少 action 字段")
        check("add_supplier 包含 Purchase:Supplier func", "Purchase:Supplier" in add_supplier_code, "缺少 func 字段")
    else:
        check("找到 add_supplier 函数", False, "未找到函数定义")
    
    # ========================================
    # 测试 3: 检查 modify_supplier_strategy 日志
    # ========================================
    print("\n[3] 检查 modify_supplier_strategy 函数日志")
    
    modify_strategy_match = re.search(r'def modify_supplier_strategy\(.*?\n(?=\n@|\nclass |\Z)', content, re.DOTALL)
    if modify_strategy_match:
        modify_strategy_code = modify_strategy_match.group()
        check("modify_supplier_strategy 存在 audit_logger.info", "audit_logger.info" in modify_strategy_code, "缺少成功日志")
        check("modify_supplier_strategy 存在 audit_logger.error", "audit_logger.error" in modify_strategy_code, "缺少失败日志")
        check("modify_supplier_strategy 包含 UPDATE_STRATEGY action", "UPDATE_STRATEGY" in modify_strategy_code, "缺少 action 字段")
        check("modify_supplier_strategy 包含 Purchase:Strategy func", "Purchase:Strategy" in modify_strategy_code, "缺少 func 字段")
    else:
        check("找到 modify_supplier_strategy 函数", False, "未找到函数定义")
    
    # ========================================
    # 测试 4: 检查日志不包含敏感信息（严格脱敏）
    # ========================================
    print("\n[4] 检查日志不包含敏感信息（表名/路径/SQL/备份文件名）")
    
    # 提取所有 audit_logger 调用的内容
    logger_calls = re.findall(r'audit_logger\.[a-z]+\([^)]+\)', content, re.DOTALL)
    logger_text = " ".join(logger_calls)
    
    # 敏感关键词黑名单
    sensitive_keywords = [
        "/Users/",          # 绝对路径
        "backups/",         # 备份路径
        ".sql",             # SQL 文件
        "SELECT ",          # SQL 语句
        "INSERT ",          # SQL 语句
        "UPDATE ",          # SQL 语句（注意空格防止误报）
        "DELETE ",          # SQL 语句
        "Data_",            # 表名前缀
        "in_supplier",      # 表名
        "in_supplier_strategy",  # 表名
    ]
    
    for keyword in sensitive_keywords:
        has_sensitive = keyword.lower() in logger_text.lower()
        check(f"日志不包含 '{keyword}'", not has_sensitive, f"发现敏感关键词: {keyword}")
    
    # ========================================
    # 汇总结果
    # ========================================
    print("\n" + "=" * 60)
    if FAIL_COUNT == 0:
        print(f"PASS - 所有 {PASS_COUNT} 项检查通过")
    else:
        print(f"FAIL - {FAIL_COUNT} 项检查失败, {PASS_COUNT} 项通过")
    print("=" * 60)
    
    return 0 if FAIL_COUNT == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
