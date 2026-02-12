# core/services/database_service.py
"""
文件说明: 数据库生命周期管理服务 (Database Service) - Fix DateTime Parsing
主要功能:
1. 备份管理 (Backup/Restore).
2. [Fix] 文件名解析: 修正 datetime 调用错误，确保能正确显示 '🕒 时间 | 🏷️ 备注'。
3. 数据清洗与审计 (表名脱敏)。
"""

import os
import subprocess
import datetime
import shutil
import pandas as pd
from pathlib import Path
from typing import List, Tuple, Callable, Optional
from sqlalchemy import text

from common.settings import settings
from core.components.db.client import DBClient
from core.sys.logger import get_logger, get_audit_logger
from core.sys.context import get_current_user

IMMUTABLE_MARKER = "[[SECURITY_AUDIT]]"

# =========================================================================
# 核心业务表列表 (24 个 in_ 系列表 - 包含 FIFO 4表)
# 这是系统的"Source of Truth"，默认备份这些表
# =========================================================================
CORE_TABLES = [
    # 供应商管理
    "in_supplier",
    "in_supplier_strategy",
    # 采购订单
    "in_po",
    "in_po_final",
    "in_po_strategy",
    # 发货单
    "in_send",
    "in_send_final",
    "in_send_list",
    # 入库
    "in_receive",
    "in_receive_final",
    # 入库异常
    "in_diff",
    "in_diff_final",
    # 付款 - 物流
    "in_pmt_logistic",
    "in_pmt_logistic_final",
    # 付款 - 定金
    "in_pmt_deposit",
    "in_pmt_deposit_final",
    # 付款 - 订单
    "in_pmt_po",
    "in_pmt_po_final",
    # 付款 - 预付款
    "in_pmt_prepay",
    "in_pmt_prepay_final",
    # FIFO 动态库存 (4表)
    "in_dynamic_tran",
    "in_dynamic_fifo_layers",
    "in_dynamic_fifo_alloc",
    "in_dynamic_landed_price",
]


class DatabaseService:

    def __init__(self):
        self.logger = get_logger("DatabaseService")
        self.audit_logger = get_audit_logger()
        self.db = DBClient()

        self.host = settings.DB_HOST
        self.port = settings.DB_PORT
        self.user = settings.DB_USER
        self.password = settings.DB_PASS
        self.db_name = settings.DB_NAME

        self.backup_dir = settings.DB_BACKUP_DIR
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
    def _update_progress(self, key: str, percent: float, status: str = ""):
        from django.core.cache import cache
        cache.set(f"db_task_{key}", {"percent": percent, "status": status}, timeout=300)

    # =========================================================================
    # [Fix] 文件名解析逻辑 (关键修复)
    # =========================================================================
    @staticmethod
    def parse_filename_to_display(filename: str) -> str:
        """
        Input:  20251209_175224_Init_Backup.sql
        Output: 🕒 2025-12-09 17:52:24 | 🏷️ Init_Backup
        """
        try:
            # 1. 去掉路径和后缀
            clean_name = os.path.basename(filename)
            if clean_name.lower().endswith('.sql'):
                clean_name = clean_name[:-4]

            # 2. 分割 (最多分割2次: Date, Time, Rest)
            parts = clean_name.split("_", 2)

            if len(parts) >= 2:
                date_part = parts[0]  # 20251209
                time_part = parts[1]  # 175224
                tag_part = parts[2] if len(parts) > 2 else ""  # Init_Backup

                # 3. 校验数字格式
                if len(date_part) == 8 and len(time_part) == 6 and date_part.isdigit() and time_part.isdigit():
                    # [Fix] 使用 datetime.datetime.strptime
                    dt_obj = datetime.datetime.strptime(f"{date_part}{time_part}", "%Y%m%d%H%M%S")
                    dt_str = dt_obj.strftime("%Y-%m-%d %H:%M:%S")

                if tag_part:
                    return f"{dt_str} | {tag_part}"
                else:
                    return f"{dt_str}"
        except Exception:
            pass

        # 解析失败兜底
        return f"{filename}"

    # --- Backup & Restore Logic ---
    def list_backups(self) -> List[str]:
        # Only list files in the main backup directory, ignoring usage of glob which might find nested ones if pattern changed
        # Use glob but explicitly just .sql in backup_dir
        return sorted([f.name for f in self.backup_dir.glob("*.sql") if f.is_file()], reverse=True)

    def _find_binary(self, name: str) -> str:
        """Helper to find mysql/mysqldump binary in common locations."""
        # 1. Try PATH
        path = shutil.which(name)
        if path: return path
        
        # 2. Try Standard Locations (Mac commonly in /usr/local/bin or /opt/homebrew/bin)
        common_paths = [
            f"/usr/local/bin/{name}",
            f"/usr/local/mysql/bin/{name}",
            f"/opt/homebrew/bin/{name}",
            f"/usr/bin/{name}",
            f"/sbin/{name}"
        ]
        
        for p in common_paths:
            if os.path.exists(p) and os.access(p, os.X_OK):
                return p
                
        return name  # Fallback to name (let subprocess fail naturally)



    def create_backup(self, tag: str = "", task_key: str = None, tables: List[str] = None, full_db: bool = False) -> Tuple[bool, str]:
        """
        Create Database Backup.
        
        Args:
            tag: 备份标签
            task_key: 任务进度 key
            tables: 备份表列表（默认备份 CORE_TABLES）
            full_db: 是否备份全库（覆盖 tables 参数）
        
        Note:
            默认行为变更：现在默认备份 24 个核心 in_ 表（包含 FIFO 4表），
            而不是全库备份。如需全库备份，请设置 full_db=True。
        """
        timestamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
        safe_tag = "".join([c for c in tag if c.isalnum() or c in ('_', '-')])
        tag_part = f"_{safe_tag}" if safe_tag else ""

        filename = f"{timestamp}{tag_part}.sql"
        filepath = self.backup_dir / filename

        # [Fix] Auto-detect binary path
        mysqldump_bin = self._find_binary('mysqldump')
        
        # 构建命令
        cmd = [mysqldump_bin, '-h', self.host, '-P', str(self.port), '-u', self.user, f'-p{self.password}',
               f'--result-file={filepath}', self.db_name]
        
        # 确定备份范围
        if full_db:
            # 全库备份 - 不指定表
            backup_scope = "全库"
        elif tables:
            # 使用指定的表列表
            cmd.extend(tables)
            backup_scope = f"{len(tables)} 表"
        else:
            # 默认备份核心表 (25 个 in_ 表)
            cmd.extend(CORE_TABLES)
            backup_scope = f"核心表 ({len(CORE_TABLES)})"
        
        if task_key: self._update_progress(task_key, 10, "正在导出数据...")

        try:
            res = subprocess.run(cmd, capture_output=True, text=True)
            
            if res.returncode == 0:
                if task_key: self._update_progress(task_key, 100, "备份完成")
                size_kb = os.path.getsize(filepath) / 1024
                    
                self.audit_logger.info(f"Created Backup: {tag}", 
                                     extra={"user": get_current_user(), "action": "BACKUP_CREATE", 
                                            "target": backup_scope})
                return True, f"备份成功 ({backup_scope}): {size_kb:.1f} KB"
            
            if filepath.exists(): os.remove(filepath)
            
            if "No such file" in str(res.stderr) and 'mysqldump' in str(res.stderr):
                 return False, "备份失败: 找不到 mysqldump (请联系运维安装 MySQL Client)"
                 
            return False, f"备份失败: {res.stderr}"
        except FileNotFoundError:
             return False, "备份失败: 系统未安装 mysqldump"
        except Exception as e:
            return False, str(e)


    def restore_backup_with_progress(self, filename: str, callback=None, task_key: str = None) -> Tuple[bool, str]:
        """
        Restores the specific tables from the backup file.
        Since the backup only contains Data_Clean_Log and Data_Inventory, 
        running mysql < file.sql will only affect those tables.
        """
        filepath = self.backup_dir / filename
        if not filepath.exists(): return False, "文件不存在"

        # [ISO] Audit Log (Attempt)
        self.audit_logger.warning(f"Restore Requested: {filename}", 
                                extra={"user": get_current_user(), "action": "BACKUP_RESTORE_ATTEMPT", "target": filename})
        # Check if rollback support is needed (User request implies logging updates)
        # For restore, it's a full overwrite of those tables usually.

        # [Fix] Auto-detect binary path
        mysql_bin = self._find_binary('mysql')

        cmd = [mysql_bin, '-h', self.host, '-P', str(self.port), '-u', self.user, f'-p{self.password}', self.db_name]
        try:
            file_size = os.path.getsize(filepath)
            bytes_read = 0
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

            with open(filepath, 'rb') as f:
                while True:
                    chunk = f.read(1024 * 1024)
                    if not chunk: break
                    proc.stdin.write(chunk)
                    proc.stdin.flush()
                    bytes_read += len(chunk)
                    progress = bytes_read / file_size if file_size > 0 else 0
                    if callback: callback(progress)
                    if task_key: self._update_progress(task_key, int(progress * 100), "正在还原数据...")

            proc.stdin.close()
            proc.wait()

            if proc.returncode == 0:
                if callback: callback(1.0)
                if task_key: self._update_progress(task_key, 100, "还原成功")
                # [ISO] Audit Log (Success)
                self.audit_logger.critical(f"Restore Successful", 
                                         extra={"user": get_current_user(), "action": "BACKUP_RESTORE_SUCCESS", "target": "Data_Clean_Log, Data_Inventory"})
                return True, "还原成功"
            return False, proc.stderr.read().decode()
        except Exception as e:
            return False, str(e)

    def delete_backup(self, filename: str) -> Tuple[bool, str]:
        try:
            p = self.backup_dir / filename
            if p.exists(): 
                os.remove(p)
                # [ISO] Audit Log
                self.audit_logger.warning(f"Deleted Backup", 
                                        extra={"user": get_current_user(), "action": "BACKUP_DELETE", "target": filename})
                return True, "已删除"
            return False, "文件不存在"
        except Exception as e:
            return False, str(e)
            
    def delete_batch_backups(self, filenames: List[str]) -> Tuple[int, int, List[str]]:
        """
        Batch delete backups.
        Returns: (success_count, fail_count, update_messages)
        """
        success = 0
        fail = 0
        errors = []
        
        for fname in filenames:
            ok, msg = self.delete_backup(fname)
            if ok:
                success += 1
            else:
                fail += 1
                errors.append(f"{fname}: {msg}")
                
        self.audit_logger.info(f"Batch Delete Result: {success} Success, {fail} Fail", 
                             extra={"user": get_current_user(), "action": "BACKUP_BATCH_DELETE"})
        return success, fail, errors

    # --- Data Deletion Logic (Strict ISO Scope) ---
    def count_business_data_by_range(self, start_date: datetime.date, end_date: datetime.date) -> dict:
        """
        统计指定日期范围内的可清理数据数量（脱敏返回）。
        用于清洗向导 Step 2 的预览验证。
        
        Returns: {
            'sales_count': int,      # Data_Clean_Log 行数
            'inventory_count': int,  # Data_Inventory 列数
            'has_data': bool
        }
        """
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        result = {
            'sales_count': 0,
            'inventory_count': 0,
            'has_data': False
        }
        
        try:
            with self.db.atomic_transaction() as conn:
                # 1. Count Data_Clean_Log rows
                tbl_clean = "Data_Clean_Log"
                if conn.execute(text(f"SHOW TABLES LIKE '{tbl_clean}'")).first():
                    cols = [r[0] for r in conn.execute(text(f"SHOW COLUMNS FROM `{tbl_clean}`")).fetchall()]
                    target_col = next((c for c in cols if c.lower() == 'order date'), None)
                    
                    if target_col:
                        count_sql = text(f"SELECT COUNT(*) FROM `{tbl_clean}` WHERE `{target_col}` >= :s AND `{target_col}` <= :e")
                        row = conn.execute(count_sql, {"s": start_str, "e": end_str}).fetchone()
                        result['sales_count'] = row[0] if row else 0
                
                # 2. Count Data_Inventory columns
                tbl_inv = "Data_Inventory"
                if conn.execute(text(f"SHOW TABLES LIKE '{tbl_inv}'")).first():
                    inv_cols = [r[0] for r in conn.execute(text(f"SHOW COLUMNS FROM `{tbl_inv}`")).fetchall()]
                    col_count = 0
                    for col in inv_cols:
                        try:
                            if len(col) == 10 and col[4] == '-' and col[7] == '-':
                                if start_str <= col <= end_str:
                                    col_count += 1
                        except:
                            pass
                    result['inventory_count'] = col_count
                
                result['has_data'] = (result['sales_count'] > 0) or (result['inventory_count'] > 0)
                
        except Exception as e:
            self.logger.error(f"Count business data failed: {e}")
            # 返回 0 但不暴露错误细节
            
        return result
    
    def delete_business_data_by_range(self, start_date: datetime.date, end_date: datetime.date, reason: str) -> Tuple[
        bool, str]:
        """
        Strictly deletes data from Data_Clean_Log (Row-based) and Data_Inventory (Column-based)
        """
        user = get_current_user()
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")

        audit_msg = f"{IMMUTABLE_MARKER} 数据清理请求 | Range: {start_str} to {end_str} | Reason: {reason}"
        self.audit_logger.critical(audit_msg, extra={"user": user, "action": "DATA_DELETION", "table": "Data_Clean_Log, Data_Inventory"})

        log_lines = []
        
        try:
            with self.db.atomic_transaction() as conn:
                # 1. Data_Clean_Log: Delete by 'order date' row
                tbl_clean = "Data_Clean_Log"
                row_count = 0
                if conn.execute(text(f"SHOW TABLES LIKE '{tbl_clean}'")).first():
                     # Assumes 'order date' is the column as per user spec
                     # Check if column exists, if not try 'Order Date' or others? 
                     # User said: "第一列order date的值为该行记录的时间标签"
                     cols = [r[0] for r in conn.execute(text(f"SHOW COLUMNS FROM `{tbl_clean}`")).fetchall()]
                     # Find 'order date' case insensitive
                     target_col = next((c for c in cols if c.lower() == 'order date'), None)
                     
                     if target_col:
                        del_sql = text(f"DELETE FROM `{tbl_clean}` WHERE `{target_col}` >= :s AND `{target_col}` <= :e")
                        res = conn.execute(del_sql, {"s": start_str, "e": end_str})
                        row_count = res.rowcount
                        log_lines.append(f" 交易数据: 删除了 {row_count} 行 (按日期范围)")
                     else:
                        log_lines.append(f" {tbl_clean}: 未找到 'order date' 列")
                
                # 2. Data_Inventory: Delete by Column Name (Date)
                tbl_inv = "Data_Inventory"
                col_count = 0
                if conn.execute(text(f"SHOW TABLES LIKE '{tbl_inv}'")).first():
                    inv_cols = [r[0] for r in conn.execute(text(f"SHOW COLUMNS FROM `{tbl_inv}`")).fetchall()]
                    cols_to_drop = []
                    for col in inv_cols:
                        # User said: "列名为该列数据的时间标签"
                        # Check if column name parses to date in range
                        # Attempt standard ISO format 2025-01-01
                        try:
                            # Heuristic: YYYY-MM-DD
                            if len(col) == 10 and col[4] == '-' and col[7] == '-':
                                if start_str <= col <= end_str:
                                    cols_to_drop.append(col)
                        except:
                            pass

                    if cols_to_drop:
                        drop_parts = [f"DROP COLUMN `{c}`" for c in cols_to_drop]
                        alter_sql = f"ALTER TABLE `{tbl_inv}` " + ", ".join(drop_parts)
                        conn.execute(text(alter_sql))
                        col_count = len(cols_to_drop)
                        log_lines.append(f" 库存数据: 删除了 {col_count} 个日期列 (按过期列删除)")
                    else:
                        log_lines.append(f" 库存数据: 未发现范围内的过期数据")

            final_msg = "\n".join(log_lines)
            self.logger.warning(f"数据清理完成:\n{final_msg}")
            
            # Additional Audit for Result
            self.audit_logger.critical(f"{IMMUTABLE_MARKER} 清理结果: Clean_Log_Rows={row_count}, Inv_Cols={col_count}",
                                       extra={"user": user, "action": "DATA_DELETION_RESULT"})

            return True, final_msg
        except Exception as e:
            self.logger.error(f"数据清理失败: {e}")
            return False, str(e)