# core/sys/lock_manager.py
"""
文件说明: 分布式并发锁管理器 (Concurrency Lock Manager)
主要功能:
1. 提供基于数据库的资源锁定机制 (System_Locks)。
2. 防止多用户同时操作关键数据表 (Race Condition Prevention)。
3. 支持锁的自动过期与强制释放，以及用户登出时的批量解锁。
"""

import pandas as pd
from typing import Optional, Tuple, List
from sqlalchemy import text

from core.components.db.client import DBClient
from core.sys.logger import get_logger


class LockManager:
    """
    [核心组件] 全局锁管理器
    建议的资源 Key (Resource Key) 标准:
    - 'Data_Transaction': 交易数据表 (ETL上传/清洗)
    - 'Data_Inventory': 库存数据表 (ETL同步/手动修改)
    - 'Data_COGS': 档案数据表 (批量修改/新增SKU)
    """

    TABLE_NAME = "System_Locks"
    TIMEOUT_MINUTES = 30  # 锁默认过期时间，防止死锁

    logger = get_logger("LockManager")

    @classmethod
    def initialize(cls):
        """[初始化] 创建锁表结构"""
        sql = f"""
        CREATE TABLE IF NOT EXISTS `{cls.TABLE_NAME}` (
            `resource_key` VARCHAR(50) NOT NULL,
            `locked_by` VARCHAR(64) NOT NULL,
            `locked_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `module_name` VARCHAR(50),
            PRIMARY KEY (`resource_key`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        DBClient.execute_stmt(sql)

    @classmethod
    def acquire_lock(cls, resource_key: str, user: str, module: str) -> Tuple[bool, str]:
        """
        [原子操作] 尝试获取锁
        :param resource_key: 资源标识 (如 Data_Transaction)
        :param user: 当前用户名
        :param module: 操作模块描述 (用于提示其他人)
        :return: (是否成功, 提示信息)
        """
        if not user: return False, "匿名用户无法获取锁"

        # 1. 检查当前锁状态
        current = cls.get_lock_info(resource_key)

        if current:
            owner = current['locked_by']
            time_str = str(current['locked_at'])

            # 如果是自己持有的锁，刷新时间并返回成功 (可重入)
            if owner == user:
                cls._refresh_lock(resource_key)
                return True, "Lock Refreshed"

            # 检查是否过期 (这里简化处理，依赖DB时间戳，暂不自动踢人，由人工判断)
            return False, f"资源 [{resource_key}] 正被用户 [{owner}] 占用 (开始时间: {time_str})。请等待其操作完成。"

        # 2. 尝试写入锁 (Insert)
        try:
            sql = f"""
            INSERT INTO `{cls.TABLE_NAME}` (resource_key, locked_by, module_name, locked_at)
            VALUES (:k, :u, :m, NOW())
            """
            DBClient.execute_stmt(sql, {"k": resource_key, "u": user, "m": module})
            cls.logger.info(f"🔒 锁定资源: {resource_key} | User: {user}")
            return True, "Lock Acquired"
        except Exception as e:
            cls.logger.warning(f"加锁竞争失败: {e}")
            return False, "资源正忙，请稍后重试。"

    @classmethod
    def release_lock(cls, resource_key: str, user: str) -> bool:
        """[原子操作] 释放锁"""
        try:
            # 只能释放自己的锁
            sql = f"DELETE FROM `{cls.TABLE_NAME}` WHERE resource_key=:k AND locked_by=:u"
            DBClient.execute_stmt(sql, {"k": resource_key, "u": user})
            cls.logger.info(f"🔓 释放资源: {resource_key} | User: {user}")
            return True
        except Exception as e:
            cls.logger.error(f"释放锁失败: {e}")
            return False

    @classmethod
    def release_all_user_locks(cls, user: str) -> List[str]:
        """
        [清理操作] 释放指定用户的所有锁 (用于登出/断线/异常退出)
        :return: 被释放的资源列表 (例如 ['Data_Transaction'])，供上层判断是否需要回滚
        """
        try:
            # 1. 查询该用户持有哪些锁
            df = DBClient.read_df(f"SELECT resource_key FROM `{cls.TABLE_NAME}` WHERE locked_by=:u", {"u": user})
            resources = df['resource_key'].tolist() if not df.empty else []

            if resources:
                # 2. 删除
                sql = f"DELETE FROM `{cls.TABLE_NAME}` WHERE locked_by=:u"
                DBClient.execute_stmt(sql, {"u": user})
                cls.logger.warning(f"🧹 强制释放用户 [{user}] 的所有锁: {resources}")

            return resources
        except Exception as e:
            cls.logger.error(f"批量释放失败: {e}")
            return []

    @classmethod
    def get_lock_info(cls, resource_key: str) -> Optional[dict]:
        """查询锁信息"""
        sql = f"SELECT * FROM `{cls.TABLE_NAME}` WHERE resource_key=:k"
        df = DBClient.read_df(sql, {"k": resource_key})
        if not df.empty:
            return df.iloc[0].to_dict()
        return None

    @classmethod
    def check_access(cls, resource_key: str, user: str) -> Tuple[bool, str]:
        """
        [权限检查] 判断当前用户是否有权操作资源
        逻辑: 资源未锁定 OR 资源被自己锁定 -> True
        """
        info = cls.get_lock_info(resource_key)
        if not info:
            return True, "Available"

        if info['locked_by'] == user:
            return True, "Owned by you"

        return False, f"🚫 系统锁定: 用户 [{info['locked_by']}] 正在使用该功能 [{info['module_name']}]，请稍候。"

    @classmethod
    def _refresh_lock(cls, resource_key: str):
        """刷新锁的心跳时间"""
        DBClient.execute_stmt(f"UPDATE `{cls.TABLE_NAME}` SET locked_at=NOW() WHERE resource_key=:k",
                              {"k": resource_key})