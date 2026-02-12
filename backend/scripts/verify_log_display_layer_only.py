#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验收脚本: verify_log_display_layer_only.py
目的: 验证方案A只改展示层，不改存储层

验收标准:
- masker.py 存在 mask_target 函数
- log_service.py 在展示层调用 mask_target
- logger.py 格式串未被修改（存储层不变）
- db/client.py SQL 记录逻辑未被修改（存储层不变）
"""

import os
import sys

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
    print("验收脚本: 方案A 展示层改动验证（不改存储层）")
    print("=" * 60)
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # ========================================
    # 测试 1: masker.py 存在 mask_target
    # ========================================
    print("\n[1] 检查 masker.py 展示层脱敏函数")
    
    masker_path = os.path.join(base_dir, "apps", "audit", "core", "masker.py")
    with open(masker_path, "r", encoding="utf-8") as f:
        masker_content = f.read()
    
    check("存在 mask_target 函数", "def mask_target(" in masker_content, "未找到 mask_target 函数")
    check("存在 TARGET_ALIAS_MAP 映射表", "TARGET_ALIAS_MAP" in masker_content, "未找到别名映射表")
    check("存在 _match_alias 内部函数", "def _match_alias(" in masker_content, "未找到 _match_alias")
    
    # ========================================
    # 测试 2: log_service.py 调用 mask_target
    # ========================================
    print("\n[2] 检查 log_service.py 展示层调用")
    
    log_service_path = os.path.join(base_dir, "core", "services", "log_service.py")
    with open(log_service_path, "r", encoding="utf-8") as f:
        log_service_content = f.read()
    
    mask_target_calls = log_service_content.count("AuditMasker.mask_target(")
    check("log_service 调用 mask_target", mask_target_calls >= 3, f"调用次数不足: {mask_target_calls}")
    
    # ========================================
    # 测试 3: 存储层未被修改（logger.py 格式串）
    # ========================================
    print("\n[3] 验证存储层未被修改 (logger.py)")
    
    logger_path = os.path.join(base_dir, "core", "sys", "logger.py")
    with open(logger_path, "r", encoding="utf-8") as f:
        logger_content = f.read()
    
    # 关键格式串应保持原样
    check("audit.log 格式串包含 Table=%(target)s", "Table=%(target)s" in logger_content, "格式串被修改")
    check("audit.log 格式串包含 sql=%(sql)s", "sql=%(sql)s" in logger_content, "格式串被修改")
    
    # ========================================
    # 测试 4: 存储层未被修改（db/client.py SQL 记录）
    # ========================================
    print("\n[4] 验证存储层未被修改 (db/client.py)")
    
    client_path = os.path.join(base_dir, "core", "components", "db", "client.py")
    with open(client_path, "r", encoding="utf-8") as f:
        client_content = f.read()
    
    # SQL 记录逻辑应保持原样
    check("db/client 仍记录 SQL", '"sql":' in client_content, "SQL 记录被移除")
    check("db/client 仍使用 audit_logger", "audit_logger" in client_content, "audit_logger 被移除")
    
    # ========================================
    # 汇总结果
    # ========================================
    print("\n" + "=" * 60)
    if FAIL_COUNT == 0:
        print(f"PASS - 所有 {PASS_COUNT} 项检查通过 (方案A: 只改展示层)")
    else:
        print(f"FAIL - {FAIL_COUNT} 项检查失败, {PASS_COUNT} 项通过")
    print("=" * 60)
    
    return 0 if FAIL_COUNT == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
