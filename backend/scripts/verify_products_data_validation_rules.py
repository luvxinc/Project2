#!/usr/bin/env python3
"""
验收脚本：产品数据维护 - 验证规则单元测试

测试内容：
1. isValidDecimal 规则
2. isPositiveInteger 规则
3. 综合验证场景
"""
import sys
import math

def is_valid_decimal(val):
    """
    验证规则：非负浮点数，最多2位小数
    Python 版本，与前端 JS 逻辑一致
    """
    if val is None or val == '':
        return False
    try:
        num = float(val)
        # 检查 NaN 和 Infinity
        if not math.isfinite(num) or num < 0:
            return False
        # 检查小数位数
        str_val = str(val)
        if '.' in str_val:
            decimal_part = str_val.split('.')[1]
            if len(decimal_part) > 2:
                return False
        return True
    except (ValueError, TypeError):
        return False


def is_positive_integer(val):
    """
    验证规则：正整数 (> 0)
    Python 版本，与前端 JS 逻辑一致
    """
    if val is None or val == '':
        return False
    try:
        str_val = str(val).strip()
        num = int(str_val)
        return num > 0 and str(num) == str_val
    except (ValueError, TypeError):
        return False


def main():
    all_passed = True
    
    print("=" * 60)
    print("产品数据维护 - 验证规则单元测试")
    print("=" * 60)
    
    # ============================================================
    # Test 1: isValidDecimal - 有效值
    # ============================================================
    print("\n[Test 1] isValidDecimal - 有效值")
    valid_decimals = [0, 0.0, 0.00, 10, 10.5, 10.99, 100.00, '0', '0.5', '10.99']
    for val in valid_decimals:
        result = is_valid_decimal(val)
        if result:
            print(f"  ✅ {repr(val)} -> True")
        else:
            print(f"  ❌ {repr(val)} -> False (期望 True)")
            all_passed = False

    # ============================================================
    # Test 2: isValidDecimal - 无效值
    # ============================================================
    print("\n[Test 2] isValidDecimal - 无效值")
    invalid_decimals = [
        (None, '空值'),
        ('', '空字符串'),
        (-1, '负数'),
        (-0.01, '负小数'),
        ('10.999', '超过2位小数'),
        ('abc', '非数字字符串'),
        (float('nan'), 'NaN'),
        (float('inf'), 'Infinity'),
    ]
    for val, desc in invalid_decimals:
        result = is_valid_decimal(val)
        if not result:
            print(f"  ✅ {repr(val)} ({desc}) -> False")
        else:
            print(f"  ❌ {repr(val)} ({desc}) -> True (期望 False)")
            all_passed = False

    # ============================================================
    # Test 3: isPositiveInteger - 有效值
    # ============================================================
    print("\n[Test 3] isPositiveInteger - 有效值")
    valid_integers = [1, 5, 100, 999, '1', '10', '999']
    for val in valid_integers:
        result = is_positive_integer(val)
        if result:
            print(f"  ✅ {repr(val)} -> True")
        else:
            print(f"  ❌ {repr(val)} -> False (期望 True)")
            all_passed = False

    # ============================================================
    # Test 4: isPositiveInteger - 无效值
    # ============================================================
    print("\n[Test 4] isPositiveInteger - 无效值")
    invalid_integers = [
        (None, '空值'),
        ('', '空字符串'),
        (0, '零'),
        (-1, '负数'),
        (1.5, '小数'),
        ('1.5', '小数字符串'),
        ('1.0', '带小数点的字符串'),
        ('abc', '非数字字符串'),
        ('01', '前导零'),
    ]
    for val, desc in invalid_integers:
        result = is_positive_integer(val)
        if not result:
            print(f"  ✅ {repr(val)} ({desc}) -> False")
        else:
            print(f"  ❌ {repr(val)} ({desc}) -> True (期望 False)")
            all_passed = False

    # ============================================================
    # Test 5: 综合场景 - 模拟 dirtyRow 验证
    # ============================================================
    print("\n[Test 5] 综合场景 - 模拟行验证")
    
    test_rows = [
        # (cost, freight, weight, expected_valid, description)
        (10.5, 0.5, 1, True, '正常数据'),
        (0, 0, 1, True, '零成本'),
        (100.99, 50.00, 999, True, '大数值'),
        (-1, 0, 1, False, '负成本'),
        (10, -0.5, 1, False, '负运费'),
        (10, 0, 0, False, '零重量'),
        (10, 0, -1, False, '负重量'),
        (10.999, 0, 1, False, '成本超精度'),
        (10, 0, 1.5, False, '小数重量'),
    ]
    
    for cost, freight, weight, expected_valid, desc in test_rows:
        errors = []
        if not is_valid_decimal(cost):
            errors.append('Cost')
        if not is_valid_decimal(freight):
            errors.append('Freight')
        if not is_positive_integer(weight):
            errors.append('Weight')
        
        is_valid = len(errors) == 0
        if is_valid == expected_valid:
            status = '✅' if expected_valid else '✅ (预期失败)'
            print(f"  {status} {desc}: Cost={cost}, Freight={freight}, Weight={weight}")
        else:
            print(f"  ❌ {desc}: 期望 {'有效' if expected_valid else '无效'}, 实际 {'有效' if is_valid else '无效'} (错误: {errors})")
            all_passed = False

    # ============================================================
    # 最终结果
    # ============================================================
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 所有验证规则测试 PASS")
        print("=" * 60)
        return 0
    else:
        print("❌ 存在失败项，请检查上述输出")
        print("=" * 60)
        return 1

if __name__ == '__main__':
    sys.exit(main())
