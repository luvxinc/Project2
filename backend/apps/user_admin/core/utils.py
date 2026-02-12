# File: backend/apps/user_admin/core/utils.py
"""
# ==============================================================================
# 模块名称: 配置与文件工具 (User Admin Utils)
# ==============================================================================
#
# [Purpose / 用途]
# 提供安全的 JSON 配置文件读写能力，支持原子写入。
#
# [ISO Compliance / 合规性]
# - 完整性: 采用"写临时文件 -> 原子重命名" (Write-Replace) 策略，防止断电导致文件损坏。
#
# ==============================================================================
"""

import json
import shutil
import datetime
from pathlib import Path
from typing import Dict, Any

from backend.common.settings import settings
from backend.core.sys.logger import get_logger

logger = get_logger("UserAdminUtils")


class ConfigFileHandler:
    """
    配置文件处理器
    """

    # 备份数量限制
    MAX_BACKUPS_PER_FILE = 10

    @staticmethod
    def _create_backup(target_path: Path) -> str:
        """
        创建文件备份（自动清理超出数量限制的旧备份）
        """
        if not target_path.exists():
            return "No Previous Version"
            
        backup_dir = settings.BACKUP_DIR / "config"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        backup_name = f"config_backup_{ts}_{target_path.name}"
        backup_path = backup_dir / backup_name
        
        try:
            shutil.copy2(target_path, backup_path)
            
            # 清理超出数量限制的旧备份 (保留最新的 MAX_BACKUPS_PER_FILE 个)
            ConfigFileHandler._cleanup_old_backups(backup_dir, target_path.name)
            
            return backup_name
        except Exception as e:
            logger.error(f"备份失败: {e}")
            return "Backup Failed"

    @staticmethod
    def _cleanup_old_backups(backup_dir: Path, config_filename: str) -> None:
        """
        清理旧备份，保留最新的 MAX_BACKUPS_PER_FILE 个
        """
        try:
            # 找出该配置文件的所有备份
            pattern = f"config_backup_*_{config_filename}"
            backups = sorted(backup_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
            
            # 删除超出限制的旧备份
            if len(backups) > ConfigFileHandler.MAX_BACKUPS_PER_FILE:
                for old_backup in backups[ConfigFileHandler.MAX_BACKUPS_PER_FILE:]:
                    old_backup.unlink()
                    logger.info(f"清理旧备份: {old_backup.name}")
        except Exception as e:
            logger.warning(f"清理旧备份时出错: {e}")


    @staticmethod
    def load_json(file_path: Path, default: Any = None) -> Any:
        """安全读取 JSON"""
        if not file_path.exists():
            if default is not None:
                return default
            return {}

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            # [Fix] 脱敏：只记录文件名
            logger.error(f"JSON 读取失败 [{file_path.name}]", extra={"status": "Failed(System)"})
            return default if default is not None else {}

    @classmethod
    def save_json_with_backup(cls, file_path: Path, data: Any, operator: str, reason: str = "Config Update") -> str:
        """
        [核心操作] 保存配置 (带备份)
        1. 备份原文件。
        2. 覆写原文件。
        3. 记录操作日志。
        """
        # 1. 创建备份
        backup_ref = cls._create_backup(file_path)

        # 2. 写入
        temp_path = file_path.with_suffix(".tmp")
        try:
            # 临时写入，防止断电导致文件损坏
            import os
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())  # [Fix] 确保数据写入磁盘

            # 原子替换
            if file_path.exists():
                file_path.unlink()
            temp_path.rename(file_path)

            # [Fix] 日志不再包含 Backup 路径
            logger.info(f"配置更新成功: {file_path.name} | Operator: {operator}",
                        extra={"status": "Success", "log_type": "Regular"})
            return backup_ref

        except Exception as e:
            if temp_path.exists():
                temp_path.unlink()
            logger.error(f"配置写入失败: {e}", extra={"status": "Failed(System)", "log_type": "System"})
            raise e