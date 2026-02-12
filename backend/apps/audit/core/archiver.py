# File: backend/apps/audit/core/archiver.py
"""
# ==============================================================================
# 模块名称: 日志归档器 (Log Archiver)
# ==============================================================================
#
# [Purpose / 用途]
# 负责在物理删除日志 (Log Purge) 之前执行强制归档。
# 这是 ISO/GDPR 合规的关键保障，防止因"误删"或"恶意删除"导致的审计链断裂。
#
# [Architecture / 架构]
# - Layer: Core Service (Archival)
# - Output: Flat File (TXT) in Backup/Log_Del
# - Dependencies: AuditContextManager (for Trace ID)
#
# [ISO Compliance / 合规性]
# - 数据留存: 删除前必须备份。
# - 责任认定: 备份文件头必须包含操作人 (Operator)、原因 (Reason)、时间戳。
# - 完整性: 记录本次删除的条目总数。
#
# ==============================================================================
"""
import os
import time
from pathlib import Path
from typing import List, Dict
from backend.common.settings import settings
from .context import AuditContextManager


class LogArchiver:
    """
    [合规归档] 负责日志物理删除前的强制备份
    """
    ARCHIVE_DIR = settings.BACKUP_DIR / "log_del"

    @classmethod
    def _get_archive_dir(cls):
        cls.ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
        return cls.ARCHIVE_DIR

    @classmethod
    def archive_before_purge(cls, log_entries: List[Dict], reason: str, operator: str) -> str:
        """
        备份日志并返回文件名
        :param log_entries: 待删除的日志字典列表
        :return: 备份文件名 (ref_timestamp_logname.txt)
        """
        if not log_entries:
            return ""

        ref = AuditContextManager.get_trace_id()
        ts = int(time.time())
        # 文件名格式: REF_Timestamp_LogPurge.txt
        filename = f"{ref}_{ts}_LogPurge.txt"
        file_path = cls._get_archive_dir() / filename

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                # 1. 写入 Header (ISO 要求: 谁, 什么时候, 为什么)
                header = (
                    f"=== LOG PURGE ARCHIVE ===\n"
                    f"Operator: {operator}\n"
                    f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
                    f"Reason: {reason}\n"
                    f"Ref ID: {ref}\n"
                    f"Total Records: {len(log_entries)}\n"
                    f"=========================\n\n"
                )
                f.write(header)

                # 2. 写入日志内容
                for entry in log_entries:
                    # 将字典转为易读的行
                    line = f"[{entry.get('time')}] {entry.get('user')} | {entry.get('action')} | {entry.get('message')}\n"
                    f.write(line)

            return filename
        except Exception as e:
            print(f"Archive failed: {e}")
            return ""

    @classmethod
    def get_archive_path(cls, filename: str) -> Path:
        return cls.ARCHIVE_DIR / filename