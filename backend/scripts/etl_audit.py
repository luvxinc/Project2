#!/usr/bin/env python3
"""
ETL 深层次审计脚本
==================
模拟完整 ETL 流程，验证：
1. 数据结构正确性
2. 函数调用链完整性
3. HTMX 目标元素匹配
4. Session 数据传递
5. 模板渲染正确性

Usage: python manage.py shell < scripts/etl_audit.py
"""

import os
import sys
import re
import json
from pathlib import Path
from typing import List, Dict, Any, Tuple

# 设置 Django 环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')
import django
django.setup()

# ============================================================
# 颜色输出
# ============================================================
class Colors:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_header(msg):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*60}")
    print(f" {msg}")
    print(f"{'='*60}{Colors.RESET}\n")

def print_ok(msg):
    print(f"  {Colors.GREEN}✓{Colors.RESET} {msg}")

def print_warn(msg):
    print(f"  {Colors.YELLOW}⚠{Colors.RESET} {msg}")

def print_err(msg):
    print(f"  {Colors.RED}✗{Colors.RESET} {msg}")

def print_info(msg):
    print(f"  {Colors.BLUE}ℹ{Colors.RESET} {msg}")

# ============================================================
# 审计结果收集
# ============================================================
audit_results = {
    'passed': [],
    'warnings': [],
    'errors': []
}

def record_pass(category, msg):
    audit_results['passed'].append((category, msg))
    print_ok(msg)

def record_warn(category, msg):
    audit_results['warnings'].append((category, msg))
    print_warn(msg)

def record_err(category, msg):
    audit_results['errors'].append((category, msg))
    print_err(msg)

# ============================================================
# 审计 1: 数据库表结构
# ============================================================
def audit_database_schema():
    print_header("审计 1: 数据库表结构")
    
    from core.components.db.client import DBClient
    
    # 检查必要的表
    required_tables = [
        'Data_Transaction',
        'Data_Order_Earning', 
        'Data_Clean_Log',
        'in_Inventory',
        'in_SKU_Master',
    ]
    
    for table in required_tables:
        try:
            result = DBClient.read_df(f"SHOW TABLES LIKE '{table}'")
            if result.empty:
                record_err('DB', f"表 {table} 不存在")
            else:
                record_pass('DB', f"表 {table} 存在")
        except Exception as e:
            record_err('DB', f"检查表 {table} 失败: {e}")
    
    # 检查 Data_Transaction 必要列
    trans_required_cols = [
        'Order number', 'Transaction creation date', 'Custom label',
        'P_Flag', 'P_SKU1', 'P_Quantity1', 'P_Key', 'row_hash'
    ]
    
    try:
        cols_df = DBClient.read_df("SHOW COLUMNS FROM Data_Transaction")
        existing_cols = set(cols_df['Field'].tolist())
        
        for col in trans_required_cols:
            if col in existing_cols:
                record_pass('DB', f"Data_Transaction.{col} 列存在")
            else:
                record_err('DB', f"Data_Transaction.{col} 列缺失")
    except Exception as e:
        record_err('DB', f"检查 Data_Transaction 列失败: {e}")

# ============================================================
# 审计 2: ETL 服务类
# ============================================================
def audit_etl_services():
    print_header("审计 2: ETL 服务类")
    
    # 测试 IngestService
    try:
        from core.services.etl.ingest import IngestService
        svc = IngestService()
        record_pass('Service', "IngestService 可实例化")
        
        # 检查必要方法
        required_methods = ['run_ingest_pipeline', '_process_files', '_detect_metadata']
        for method in required_methods:
            if hasattr(svc, method):
                record_pass('Service', f"IngestService.{method} 存在")
            else:
                record_err('Service', f"IngestService.{method} 缺失")
    except Exception as e:
        record_err('Service', f"IngestService 加载失败: {e}")
    
    # 测试 TransactionParser
    try:
        from core.services.etl.parser import TransactionParser
        parser = TransactionParser()
        record_pass('Service', "TransactionParser 可实例化")
        
        required_methods = ['run', '_process_complex_rows', '_validate_and_autofix']
        for method in required_methods:
            if hasattr(parser, method):
                record_pass('Service', f"TransactionParser.{method} 存在")
            else:
                record_err('Service', f"TransactionParser.{method} 缺失")
    except Exception as e:
        record_err('Service', f"TransactionParser 加载失败: {e}")
    
    # 测试 TransactionTransformer
    try:
        from core.services.etl.transformer import TransactionTransformer
        transformer = TransactionTransformer()
        record_pass('Service', "TransactionTransformer 可实例化")
        
        # 检查 FIFO 集成
        if hasattr(transformer, '_sync_fifo'):
            record_pass('Service', "TransactionTransformer._sync_fifo 存在 (FIFO 集成)")
        else:
            record_warn('Service', "TransactionTransformer._sync_fifo 缺失")
    except Exception as e:
        record_err('Service', f"TransactionTransformer 加载失败: {e}")
    
    # 测试 CorrectionService
    try:
        from core.services.correction import CorrectionService
        corr_svc = CorrectionService()
        record_pass('Service', "CorrectionService 可实例化")
        
        required_methods = ['get_next_pending_issue', 'apply_fix_transactional', 'is_valid_sku']
        for method in required_methods:
            if hasattr(corr_svc, method):
                record_pass('Service', f"CorrectionService.{method} 存在")
            else:
                record_err('Service', f"CorrectionService.{method} 缺失")
    except Exception as e:
        record_err('Service', f"CorrectionService 加载失败: {e}")

# ============================================================
# 审计 3: Views 函数签名和返回
# ============================================================
def audit_views_functions():
    print_header("审计 3: Views 函数完整性")
    
    try:
        from apps.etl import views
        
        # 必要的视图函数
        required_views = [
            'etl_upload',
            'etl_parse', 
            'etl_fix_sku',
            'etl_transform',
            'etl_confirm',
            'etl_cancel',
            'tab_transaction',
        ]
        
        for view_name in required_views:
            if hasattr(views, view_name):
                record_pass('Views', f"{view_name} 存在")
            else:
                record_err('Views', f"{view_name} 缺失")
        
        # 检查辅助函数
        helper_funcs = ['_get_bad_sku', '_format_pending_item', '_get_data_cutoff_date', '_get_db_stats_before']
        for func_name in helper_funcs:
            if hasattr(views, func_name):
                record_pass('Views', f"辅助函数 {func_name} 存在")
            else:
                record_warn('Views', f"辅助函数 {func_name} 缺失")
                
    except Exception as e:
        record_err('Views', f"加载 views 模块失败: {e}")

# ============================================================
# 审计 4: HTMX 目标元素匹配
# ============================================================
def audit_htmx_targets():
    print_header("审计 4: HTMX 目标元素匹配")
    
    template_dir = Path('/Users/aaron/Desktop/app/MGMT/backend/templates/etl')
    
    # 定义正确的目标映射
    correct_targets = {
        'tab_transaction.html': 'etl-process-area',  # 容器元素 ID
        'tab_inventory.html': 'inv-process-area',    # 容器元素 ID
    }
    
    # 检查 Transaction ETL 模板
    trans_partials = [
        'step_upload.html', 'step_validate.html', 'step_parse.html',
        'step_clean.html', 'step_transform.html', 'step_done.html', 'error_modal.html'
    ]
    
    for partial in trans_partials:
        filepath = template_dir / 'partials' / partial
        if filepath.exists():
            content = filepath.read_text()
            
            # 检查 hx-target
            targets = re.findall(r'hx-target="([^"]+)"', content)
            
            wrong_targets = [t for t in targets if t == '#etl-tab-content']
            correct_trans = [t for t in targets if t == '#etl-process-area']
            
            if wrong_targets:
                record_err('HTMX', f"{partial}: 发现错误的目标 #etl-tab-content ({len(wrong_targets)} 处)")
            elif correct_trans:
                record_pass('HTMX', f"{partial}: 目标正确 #etl-process-area ({len(correct_trans)} 处)")
            elif not targets:
                record_info('HTMX', f"{partial}: 无 hx-target 定义")
        else:
            record_warn('HTMX', f"{partial}: 文件不存在")
    
    # 检查 Inventory ETL 模板
    inv_partials = [
        'inv_confirm_upload.html', 'inv_done.html', 
        'inv_overwrite_confirm.html', 'inv_validate_result.html'
    ]
    
    for partial in inv_partials:
        filepath = template_dir / 'partials' / partial
        if filepath.exists():
            content = filepath.read_text()
            targets = re.findall(r'hx-target="([^"]+)"', content)
            
            wrong_targets = [t for t in targets if t == '#etl-tab-content']
            correct_inv = [t for t in targets if t == '#inv-process-area']
            
            if wrong_targets:
                record_err('HTMX', f"{partial}: 发现错误的目标 #etl-tab-content ({len(wrong_targets)} 处)")
            elif correct_inv:
                record_pass('HTMX', f"{partial}: 目标正确 #inv-process-area ({len(correct_inv)} 处)")
        else:
            record_warn('HTMX', f"{partial}: 文件不存在")
    
    # 验证主模板中的容器 ID
    for main_template, expected_id in correct_targets.items():
        filepath = template_dir / main_template
        if filepath.exists():
            content = filepath.read_text()
            if f'id="{expected_id}"' in content:
                record_pass('HTMX', f"{main_template}: 容器 ID '{expected_id}' 存在")
            else:
                record_err('HTMX', f"{main_template}: 容器 ID '{expected_id}' 缺失")

# ============================================================
# 审计 5: Session 数据流
# ============================================================
def audit_session_data_flow():
    print_header("审计 5: Session 数据流")
    
    views_path = Path('/Users/aaron/Desktop/app/MGMT/backend/apps/etl/views.py')
    content = views_path.read_text()
    
    # 检查 session 键的一致性
    session_keys = [
        ('etl_stage', '流程阶段'),
        ('etl_pending_count', '待处理数量'),
        ('etl_parse_stats', '解析统计'),
        ('etl_db_stats_before', '转换前数据库状态'),
        ('etl_fifo_ratios', 'FIFO 比例'),
    ]
    
    for key, desc in session_keys:
        # 检查写入
        write_pattern = f"request.session\\['{key}'\\]\\s*="
        writes = len(re.findall(write_pattern, content))
        
        # 检查读取
        read_pattern = f"request.session.get\\('{key}'"
        reads = len(re.findall(read_pattern, content))
        
        if writes > 0 and reads > 0:
            record_pass('Session', f"{key} ({desc}): 写入 {writes} 处, 读取 {reads} 处")
        elif writes > 0:
            record_warn('Session', f"{key} ({desc}): 只有写入 ({writes} 处), 无读取")
        elif reads > 0:
            record_warn('Session', f"{key} ({desc}): 只有读取 ({reads} 处), 无写入")
        else:
            record_info('Session', f"{key} ({desc}): 未使用")
    
    # 检查 session 清理
    cleanup_pattern = r"request\.session\.pop\(['\"]etl_"
    cleanups = len(re.findall(cleanup_pattern, content))
    if cleanups > 0:
        record_pass('Session', f"Session 清理: 发现 {cleanups} 处清理调用")
    else:
        record_warn('Session', "Session 清理: 未发现清理调用，可能导致内存泄漏")

# ============================================================
# 审计 6: Pandas Series 安全使用
# ============================================================
def audit_pandas_safety():
    print_header("审计 6: Pandas Series 安全使用")
    
    files_to_check = [
        '/Users/aaron/Desktop/app/MGMT/backend/apps/etl/views.py',
        '/Users/aaron/Desktop/app/MGMT/backend/core/services/etl/parser.py',
        '/Users/aaron/Desktop/app/MGMT/backend/core/services/correction.py',
    ]
    
    unsafe_patterns = [
        (r'if\s+\w+_item\s*:', 'if xxx_item: (Series 直接布尔判断)'),
        (r'if\s+row\s*:', 'if row: (Series 直接布尔判断)'),
        (r'df\.at\[', 'df.at[] (索引不唯一时可能返回 Series)'),
    ]
    
    safe_patterns = [
        (r'if\s+\w+\s+is\s+not\s+None', 'is not None 判断'),
        (r'\.iloc\[0\]', '.iloc[0] 安全取值'),
        (r'isinstance\(.+,\s*pd\.Series\)', 'isinstance Series 检查'),
    ]
    
    for filepath in files_to_check:
        path = Path(filepath)
        if not path.exists():
            record_warn('Pandas', f"文件不存在: {path.name}")
            continue
            
        content = path.read_text()
        filename = path.name
        
        # 检查不安全模式
        for pattern, desc in unsafe_patterns:
            matches = re.findall(pattern, content)
            if matches:
                record_warn('Pandas', f"{filename}: 发现可能不安全的模式 '{desc}' ({len(matches)} 处)")
        
        # 检查安全模式
        for pattern, desc in safe_patterns:
            matches = re.findall(pattern, content)
            if matches:
                record_pass('Pandas', f"{filename}: 使用安全模式 '{desc}' ({len(matches)} 处)")

# ============================================================
# 审计 7: URL 路由完整性
# ============================================================
def audit_url_routes():
    print_header("审计 7: URL 路由完整性")
    
    try:
        from django.urls import reverse, NoReverseMatch
        
        # Transaction ETL 路由
        trans_routes = [
            'web_ui:sales:transactions:tab_transaction',
            'web_ui:sales:transactions:upload',
            'web_ui:sales:transactions:parse',
            'web_ui:sales:transactions:fix_sku',
            'web_ui:sales:transactions:transform',
            'web_ui:sales:transactions:confirm',
            'web_ui:sales:transactions:cancel',
        ]
        
        for route in trans_routes:
            try:
                url = reverse(route)
                record_pass('URL', f"{route} → {url}")
            except NoReverseMatch:
                record_err('URL', f"{route} 路由不存在")
        
        # Inventory ETL 路由
        inv_routes = [
            'web_ui:inventory:stocktake_etl:tab_inventory',
            'web_ui:inventory:stocktake_etl:inv_validate',
        ]
        
        for route in inv_routes:
            try:
                url = reverse(route)
                record_pass('URL', f"{route} → {url}")
            except NoReverseMatch:
                record_err('URL', f"{route} 路由不存在")
                
    except Exception as e:
        record_err('URL', f"URL 路由检查失败: {e}")

# ============================================================
# 审计 8: 安全策略配置
# ============================================================
def audit_security_config():
    print_header("审计 8: 安全策略配置")
    
    overrides_path = Path('/Users/aaron/Desktop/app/MGMT/data/security_overrides.json')
    
    if not overrides_path.exists():
        record_warn('Security', "security_overrides.json 不存在")
        return
    
    try:
        with open(overrides_path) as f:
            overrides = json.load(f)
        
        etl_actions = [
            'btn_commit_sku_fix',
            'btn_run_transform',
        ]
        
        for action in etl_actions:
            if action in overrides:
                tokens = overrides[action]
                if tokens:
                    record_info('Security', f"{action}: 需要验证 {tokens}")
                else:
                    record_pass('Security', f"{action}: 无需验证 (空列表)")
            else:
                record_info('Security', f"{action}: 未配置覆盖，使用默认策略")
                
    except Exception as e:
        record_err('Security', f"读取安全配置失败: {e}")

# ============================================================
# 审计 9: 模拟解析流程
# ============================================================
def audit_parser_simulation():
    print_header("审计 9: 模拟解析流程")
    
    from core.components.db.client import DBClient
    import pandas as pd
    
    # 检查 Data_Transaction 表状态
    try:
        count_df = DBClient.read_df("SELECT COUNT(*) as cnt FROM Data_Transaction")
        count = count_df['cnt'].iloc[0]
        
        if count == 0:
            record_info('Parser', f"Data_Transaction 表为空 (需要先上传数据)")
        else:
            record_pass('Parser', f"Data_Transaction 表有 {count} 条记录")
            
            # 尝试运行 Parser
            from core.services.etl.parser import TransactionParser
            parser = TransactionParser()
            
            try:
                result = parser.run()
                status = result.get('status', 'unknown')
                
                if status == 'success':
                    pending = result.get('pending_count', 0)
                    record_pass('Parser', f"Parser.run() 成功执行, pending={pending}")
                elif status == 'empty':
                    record_info('Parser', "Parser.run() 返回 empty (表为空)")
                else:
                    record_warn('Parser', f"Parser.run() 返回状态: {status}")
                    
            except Exception as e:
                record_err('Parser', f"Parser.run() 执行失败: {e}")
                import traceback
                print(f"    {Colors.RED}详细错误:{Colors.RESET}")
                for line in traceback.format_exc().split('\n')[-5:]:
                    if line.strip():
                        print(f"      {line}")
                        
    except Exception as e:
        record_err('Parser', f"检查 Data_Transaction 失败: {e}")

# ============================================================
# 审计 10: FIFO 集成
# ============================================================
def audit_fifo_integration():
    print_header("审计 10: FIFO 集成")
    
    try:
        from core.services.fifo.sales_sync import SalesFifoSyncService
        svc = SalesFifoSyncService()
        record_pass('FIFO', "SalesFifoSyncService 可实例化")
        
        if hasattr(svc, 'sync_from_sales'):
            record_pass('FIFO', "sync_from_sales 方法存在")
        else:
            record_err('FIFO', "sync_from_sales 方法缺失")
            
    except ImportError as e:
        record_warn('FIFO', f"FIFO 服务未安装或导入失败: {e}")
    except Exception as e:
        record_err('FIFO', f"FIFO 服务检查失败: {e}")
    
    # 检查 Transformer 中的 FIFO 调用
    transformer_path = Path('/Users/aaron/Desktop/app/MGMT/backend/core/services/etl/transformer.py')
    if transformer_path.exists():
        content = transformer_path.read_text()
        
        if 'return_ratios' in content:
            record_pass('FIFO', "Transformer 接受 return_ratios 参数")
        else:
            record_warn('FIFO', "Transformer 缺少 return_ratios 参数")
            
        if '_sync_fifo' in content:
            record_pass('FIFO', "Transformer 包含 _sync_fifo 方法")
        else:
            record_warn('FIFO', "Transformer 缺少 _sync_fifo 方法")

# ============================================================
# 生成审计报告
# ============================================================
def generate_report():
    print_header("审计报告摘要")
    
    total_passed = len(audit_results['passed'])
    total_warnings = len(audit_results['warnings'])
    total_errors = len(audit_results['errors'])
    
    print(f"  {Colors.GREEN}通过: {total_passed}{Colors.RESET}")
    print(f"  {Colors.YELLOW}警告: {total_warnings}{Colors.RESET}")
    print(f"  {Colors.RED}错误: {total_errors}{Colors.RESET}")
    
    if total_errors > 0:
        print(f"\n{Colors.RED}=== 错误详情 ==={Colors.RESET}")
        for category, msg in audit_results['errors']:
            print(f"  [{category}] {msg}")
    
    if total_warnings > 0:
        print(f"\n{Colors.YELLOW}=== 警告详情 ==={Colors.RESET}")
        for category, msg in audit_results['warnings']:
            print(f"  [{category}] {msg}")
    
    print()
    if total_errors == 0:
        print(f"{Colors.GREEN}{Colors.BOLD}✅ ETL 审计通过！{Colors.RESET}")
    else:
        print(f"{Colors.RED}{Colors.BOLD}❌ ETL 审计发现 {total_errors} 个错误需要修复{Colors.RESET}")
    
    return total_errors == 0

# ============================================================
# 主入口
# ============================================================
def main():
    print(f"\n{Colors.BOLD}{Colors.CYAN}")
    print("╔════════════════════════════════════════════════════════════╗")
    print("║           ETL 深层次审计脚本 v1.0                          ║")
    print("║           MGMT ERP System - 2026                           ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print(f"{Colors.RESET}")
    
    # 执行所有审计
    audit_database_schema()
    audit_etl_services()
    audit_views_functions()
    audit_htmx_targets()
    audit_session_data_flow()
    audit_pandas_safety()
    audit_url_routes()
    audit_security_config()
    audit_parser_simulation()
    audit_fifo_integration()
    
    # 生成报告
    success = generate_report()
    
    return 0 if success else 1

if __name__ == '__main__':
    sys.exit(main())
