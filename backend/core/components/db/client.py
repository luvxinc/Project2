# File: core/components/db/client.py
"""
文件说明: 数据库客户端 (Database Client) - V3.0 Snapshot Integrated
修改记录:
[V3.0] 2025-12-14
1. [Core] 集成 SnapshotManager，实现写前复制 (COW)。
2. [Audit] 记录 SQL 和 Snapshot ID 到底层审计日志。
"""

import pandas as pd
import re
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from typing import Optional, Dict, Any, Union

from backend.common.settings import settings
from core.sys.logger import get_audit_logger

audit_logger = get_audit_logger()


class DBClient:
    _engine: Optional[Engine] = None

    @classmethod
    def get_engine(cls) -> Engine:
        if cls._engine is None:
            cls._engine = create_engine(
                settings.SQLALCHEMY_URL,
                pool_recycle=3600,
                pool_pre_ping=True,
                # [Fix] 强制设置连接的默认 collation，确保临时表与主表一致
                connect_args={
                    'init_command': "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
                }
            )
        return cls._engine

    @classmethod
    def read_df(cls, sql: str, params: dict = None) -> pd.DataFrame:
        try:
            with cls.get_engine().connect() as conn:
                stmt = text(sql)
                return pd.read_sql(stmt, conn, params=params)
        except Exception as e:
            # 查询错误不属于审计重点，但可以记入 Error Log
            print(f"🔥 DATABASE QUERY ERROR: {e}")
            return pd.DataFrame()

    @classmethod
    def execute_stmt(cls, sql: str, params: dict = None) -> bool:
        """
        执行变更 (INSERT / UPDATE / DELETE / DDL)
        ** 集成快照与审计 **
        """
        # 1. 局部导入避免循环依赖
        from backend.apps.audit.core.snapshot import SnapshotManager

        meta = cls._parse_sql_meta(sql)
        # 预处理 SQL 和参数，用于日志
        safe_sql = cls._normalize_sql(sql)
        safe_params = cls._sanitize_params(params)
        snapshot_id = "-"

        try:
            # 2. [ISO] 写前复制 (Copy-On-Write)
            # 仅针对 UPDATE 和 DELETE 操作进行快照
            # 且排除 System_Locks (锁表频繁变动无需快照)
            if meta["action"] in ["UPDATE", "DELETE"] and meta["table"] not in ["System_Locks", "-"]:
                # 尝试构建 WHERE 子句
                # 这是一个简化的解析，假设 SQL 结构为 "UPDATE `table` ... WHERE ..."
                where_clause = cls._extract_where_clause(sql)
                if where_clause:
                    snapshot_id = SnapshotManager.create_snapshot(
                        table_name=meta["table"],
                        condition_sql=where_clause,
                        params=params or {}
                    )

            # 3. 执行物理操作
            with cls.get_engine().begin() as conn:
                stmt = text(sql) if isinstance(sql, str) else sql
                result = conn.execute(stmt, params if params else {})
                rows_affected = result.rowcount
                meta["rows"] = rows_affected

            # 4. [ISO] 底层审计记录 (Infra Log)
            audit_logger.info(
                f"[DB] {meta['action']} {meta['table']}",
                extra={
                    "action": meta["action"],
                    "target": meta["table"],
                    "sql": f"{safe_sql} ;; Params: {safe_params}",
                    "snapshot_id": snapshot_id if snapshot_id else "-",
                    "status": "Success",
                    "details": f"Rows Affected: {rows_affected}",
                    "log_type": "Regular"
                }
            )
            return True

        except Exception as e:
            # 5. 失败记录
            audit_logger.critical(
                f"[DB FAILED] {meta['action']} {meta['table']}",
                extra={
                    "action": meta["action"],
                    "target": meta["table"],
                    "sql": f"{safe_sql} ;; Params: {safe_params}",
                    "status": "Failed(System)",
                    "root_cause": str(e),
                    "log_type": "Regular"
                }
            )
            return False

    @classmethod
    def atomic_transaction(cls):
        return cls.get_engine().begin()

    # --- 辅助工具 ---

    @staticmethod
    def _parse_sql_meta(sql: Union[str, Any]) -> Dict[str, Any]:
        raw_sql = str(sql).strip().upper()
        norm_sql = re.sub(r'\s+', ' ', raw_sql)
        meta = {"action": "SQL", "table": "-", "rows": 0}

        first_word = norm_sql.split(' ')[0]
        if first_word in ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "CREATE", "DROP", "ALTER"]:
            meta["action"] = first_word

        # 简单的正则提取表名
        try:
            target = "-"
            # UPDATE `table` ...
            if meta["action"] == "UPDATE":
                m = re.search(r"UPDATE\s+[`']?([a-zA-Z0-9_]+)[`']?", norm_sql)
                if m: target = m.group(1)
            # FROM `table` ...
            elif meta["action"] == "DELETE":
                m = re.search(r"FROM\s+[`']?([a-zA-Z0-9_]+)[`']?", norm_sql)
                if m: target = m.group(1)
            # INTO `table` ...
            elif meta["action"] == "INSERT":
                m = re.search(r"INTO\s+[`']?([a-zA-Z0-9_]+)[`']?", norm_sql)
                if m: target = m.group(1)

            meta["table"] = target
        except:
            pass
        return meta

    @staticmethod
    def _extract_where_clause(sql: str) -> str:
        """
        提取 WHERE 子句，用于快照查询
        """
        upper_sql = sql.upper().replace('\n', ' ')
        idx = upper_sql.find("WHERE")
        if idx != -1:
            return sql[idx:]  # 返回 "WHERE id=:id ..."
        return ""

    @staticmethod
    def _sanitize_params(params: Optional[Dict]) -> str:
        if not params: return "{}"
        SENSITIVE_KEYS = {'password', 'passwd', 'pwd', 'token', 'key', 'secret'}
        safe_copy = {}
        for k, v in params.items():
            if any(s in k.lower() for s in SENSITIVE_KEYS):
                safe_copy[k] = "******"
            else:
                safe_copy[k] = str(v)[:100] + "..." if len(str(v)) > 100 else v
        return str(safe_copy)

    @staticmethod
    def _normalize_sql(sql: Union[str, Any]) -> str:
        s = str(sql).replace('\n', ' ').replace('\r', ' ')
        return re.sub(r'\s+', ' ', s).strip()