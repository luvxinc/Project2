# File: core/services/auth/service.py
"""
# ==============================================================================
# 模块名称: 认证与用户管理服务 (Authentication Service)
# ==============================================================================
#
# [Purpose / 用途]
# 提供全站统一的用户身份认证、账号管理、权限校验及审计日志记录功能。
# 它是系统的核心安全组件，所有登录请求和权限判定必须经过此模块。
#
# [Architecture / 架构]
# - Layer: Service Layer (Business Logic)
# - Dependencies:
#   - DBClient: 负责底层 SQL 执行
#   - SecurityUtils: 负责密码哈希与 Token 生成 (PBKDF2)
#   - Settings: 读取全局配置 (超时、密码策略)
#
# [Usage / 用法]
# - 登录: AuthService.authenticate(username, password, ip)
# - 鉴权: AuthService.get_permissions(username)
# - 管理: AuthService.create_user(), AuthService.delete_user()
#
# [ISO Compliance / 合规性]
# - 审计: 登录成功/失败均记录日志 (Login History)。
# - 安全: 密码使用加盐哈希存储，Token 每次刷新。
# - 锁定: 连续多次失败自动锁定账号。
#
# ==============================================================================
"""

import os
import re
from dataclasses import dataclass
from typing import Optional, Tuple, Dict, Any, List
import pandas as pd
from sqlalchemy import text

from backend.common.settings import settings
from backend.core.components.db.client import DBClient
from backend.core.components.security import SecurityUtils
from backend.core.sys.logger import get_logger


@dataclass
class User:
    username: str
    is_admin: bool
    is_locked: bool
    failed_attempts: int
    session_token: str = ""

    @property
    def is_staff(self):
        return self.is_admin

    @property
    def is_superuser(self):
        from backend.common.settings import settings
        return self.username == settings.SUPER_ADMIN_USER


class AuthService:
    USER_TABLE = "User_Account"
    PERM_TABLE = "User_Permission"
    LOGIN_HISTORY_TABLE = "User_Login_History"
    MAX_FAILED_ATTEMPTS = 10

    _logger = get_logger("AuthService")

    @classmethod
    def get_user_by_username(cls, username: str) -> Optional[User]:
        df = DBClient.read_df(f"SELECT * FROM `{cls.USER_TABLE}` WHERE username=:u LIMIT 1", {"u": username})
        if df.empty: return None
        row = df.iloc[0]
        return User(
            username=row["username"],
            is_admin=bool(row["is_admin"]),
            is_locked=bool(row["is_locked"]),
            failed_attempts=int(row["failed_attempts"]),
            session_token=row.get("session_token") or ""
        )

    @classmethod
    def initialize(cls) -> None:
        cls._ensure_schema()
        cls._bootstrap_default_users()

    @classmethod
    def _ensure_schema(cls) -> None:
        charset = settings.DB_CHARSET
        sqls = [
            f"""CREATE TABLE IF NOT EXISTS `{cls.USER_TABLE}` (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                username VARCHAR(64) NOT NULL UNIQUE, 
                password_hash VARCHAR(255) NOT NULL, 
                is_admin TINYINT(1) DEFAULT 0, 
                is_locked TINYINT(1) DEFAULT 0, 
                failed_attempts INT DEFAULT 0, 
                session_token VARCHAR(64), 
                role_version BIGINT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET={charset};""",
            f"""CREATE TABLE IF NOT EXISTS `{cls.PERM_TABLE}` (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                username VARCHAR(64) NOT NULL, 
                permission_key VARCHAR(128) NOT NULL, 
                allowed TINYINT(1) DEFAULT 1, 
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
                UNIQUE KEY uniq_user_perm (username, permission_key)
            ) ENGINE=InnoDB DEFAULT CHARSET={charset};""",
            f"""CREATE TABLE IF NOT EXISTS `{cls.LOGIN_HISTORY_TABLE}` (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                username VARCHAR(64) NOT NULL, 
                ip_address VARCHAR(45) NOT NULL, 
                login_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
                INDEX idx_user (username)
            ) ENGINE=InnoDB DEFAULT CHARSET={charset};"""
        ]
        for sql in sqls: DBClient.execute_stmt(sql)
        
        # Auto-migrate: Add role_version column if not exists (for existing databases)
        try:
            DBClient.execute_stmt(f"ALTER TABLE `{cls.USER_TABLE}` ADD COLUMN role_version BIGINT DEFAULT 0")
        except Exception:
            pass  # Column already exists

    @classmethod
    def _bootstrap_default_users(cls) -> None:
        au = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
        ap = os.getenv("DEFAULT_ADMIN_PASSWORD")
        if ap: cls._ensure_user(au, ap, is_admin=True)

        nu = os.getenv("DEFAULT_USER_USERNAME", "user")
        np = os.getenv("DEFAULT_USER_PASSWORD")
        if np: cls._ensure_user(nu, np, is_admin=False)

    @classmethod
    def _ensure_user(cls, u: str, p: str, is_admin: bool):
        df = DBClient.read_df(f"SELECT id, is_admin FROM `{cls.USER_TABLE}` WHERE username=:u", {"u": u})
        if df.empty:
            cls._logger.info(f"Bootstrap: 创建初始用户 {u} | Role: {'Admin' if is_admin else 'User'}")
            ph = SecurityUtils.hash_password(p)
            sql = f"INSERT INTO `{cls.USER_TABLE}` (username, password_hash, is_admin) VALUES (:u, :ph, :a)"
            DBClient.execute_stmt(sql, {"u": u, "ph": ph, "a": 1 if is_admin else 0})
        else:
            current_role = bool(df.iloc[0]["is_admin"])
            if current_role != is_admin:
                cls._logger.warning(
                    f"Bootstrap: 修正用户 {u} 权限 | is_admin: {current_role} -> {is_admin}",
                    extra={"user": "System", "action": "AUTO_FIX_ROLE"}
                )
                DBClient.execute_stmt(f"UPDATE `{cls.USER_TABLE}` SET is_admin=:a WHERE username=:u",
                                      {"u": u, "a": 1 if is_admin else 0})

    @classmethod
    def authenticate(cls, username: str, password: str, ip: str = "-") -> Tuple[bool, Optional[User], str]:
        u = username.strip()
        if not u or not password: return False, None, "请输入账号密码"

        df = DBClient.read_df(f"SELECT * FROM `{cls.USER_TABLE}` WHERE username=:u LIMIT 1", {"u": u})

        if df.empty:
            SecurityUtils.verify_password("dummy", SecurityUtils.hash_password("dummy"))
            cls._logger.warning(f"登录失败: 用户不存在 | User: {u}")
            return False, None, "用户名或密码错误"

        row = df.iloc[0]
        user = User(
            username=row["username"],
            is_admin=bool(row["is_admin"]),
            is_locked=bool(row["is_locked"]),
            failed_attempts=int(row["failed_attempts"]),
            session_token=row.get("session_token") or ""
        )

        if user.is_locked:
            cls._logger.warning(f"登录拦截: 锁定账号尝试登录 | User: {u}")
            return False, None, "账号已锁定"

        if not SecurityUtils.verify_password(password, row["password_hash"]):
            new_f = user.failed_attempts + 1
            is_l = 1 if new_f >= cls.MAX_FAILED_ATTEMPTS else 0

            if is_l and not user.is_locked:
                cls._logger.warning(f"账号触发自动锁定 | User: {u} | Failed: {new_f}")

            DBClient.execute_stmt(f"UPDATE `{cls.USER_TABLE}` SET failed_attempts=:f, is_locked=:l WHERE username=:u",
                                  {"f": new_f, "l": is_l, "u": u})
            return False, None, "用户名或密码错误"

        DBClient.execute_stmt(f"UPDATE `{cls.USER_TABLE}` SET failed_attempts=0 WHERE username=:u", {"u": u})
        
        # [单点登录] 登录成功时刷新 session token，使其他已登录的 session 失效
        new_token = cls.refresh_session_token(u)
        user.session_token = new_token
        
        cls.record_login_event(u, ip)
        cls._logger.info(f"登录成功: {u} | IP: {ip}")
        return True, user, "登录成功"

    @classmethod
    def verify_password_only(cls, username: str, password: str) -> bool:
        """
        仅验证密码，不刷新 token，不记录登录事件。
        用于安全矩阵验证等场景，避免影响用户当前 session。
        """
        u = username.strip()
        if not u or not password:
            return False

        df = DBClient.read_df(f"SELECT password_hash, is_locked FROM `{cls.USER_TABLE}` WHERE username=:u LIMIT 1", {"u": u})
        if df.empty:
            return False

        row = df.iloc[0]
        if row["is_locked"]:
            return False

        return SecurityUtils.verify_password(password, row["password_hash"])

    @classmethod
    def record_login_event(cls, username: str, ip: str) -> None:
        DBClient.execute_stmt(f"INSERT INTO `{cls.LOGIN_HISTORY_TABLE}` (username, ip_address) VALUES (:u, :ip)",
                              {"u": username, "ip": ip})

    @classmethod
    def refresh_session_token(cls, username: str) -> str:
        token = SecurityUtils.generate_token()
        DBClient.execute_stmt(f"UPDATE `{cls.USER_TABLE}` SET session_token=:t WHERE username=:u",
                              {"t": token, "u": username})
        return token

    @classmethod
    def verify_session_token(cls, username: str, local_token: str) -> bool:
        if not username or not local_token: return False
        try:
            df = DBClient.read_df(f"SELECT session_token FROM `{cls.USER_TABLE}` WHERE username=:u", {"u": username})
            if df.empty: return False
            db_token = df.iloc[0]["session_token"]
            return db_token == local_token
        except:
            return False

    @classmethod
    def get_raw_permissions(cls, u: str) -> Dict[str, bool]:
        """Get raw permissions without parent inference - for UI rendering"""
        df = DBClient.read_df(f"SELECT permission_key FROM `{cls.PERM_TABLE}` WHERE username=:u AND allowed=1", {"u": u})
        return {r["permission_key"]: True for _, r in df.iterrows()}

    @classmethod
    def get_permissions(cls, u: str) -> Dict[str, bool]:
        """Get user permissions with automatic parent permission inference"""
        df = DBClient.read_df(f"SELECT permission_key FROM `{cls.PERM_TABLE}` WHERE username=:u AND allowed=1", {"u": u})
        
        # Direct permissions from database
        direct_perms = {r["permission_key"]: True for _, r in df.iterrows()}
        
        # Infer parent permissions for compatibility with view checks
        # If user has "module.db_admin.backup.create", auto-add "module.db_admin.backup" and "module.db_admin"
        inferred_perms = {}
        for perm_key in direct_perms.keys():
            parts = perm_key.split('.')
            for i in range(2, len(parts)):
                parent_key = '.'.join(parts[:i])
                inferred_perms[parent_key] = True
        
        return {**direct_perms, **inferred_perms}

    @classmethod
    def list_users(cls) -> pd.DataFrame:
        return DBClient.read_df(
            f"SELECT username, is_admin, is_locked, failed_attempts FROM `{cls.USER_TABLE}` ORDER BY is_admin DESC")

    @classmethod
    def create_user(cls, u, p, is_admin=False) -> Tuple[bool, str]:
        # [Security] Backend Format Validation
        # Rule: 2-32 chars, a-z, A-Z, 0-9, _
        if not re.match(r'^[a-zA-Z0-9_]{2,32}$', u):
            return False, "用户名格式不正确 (仅允许英文字母、数字、下划线，长度2-32位)"

        if not DBClient.read_df(f"SELECT 1 FROM `{cls.USER_TABLE}` WHERE username=:u", {"u": u}).empty:
            return False, "用户已存在"
        ph = SecurityUtils.hash_password(p)
        DBClient.execute_stmt(
            f"INSERT INTO `{cls.USER_TABLE}` (username, password_hash, is_admin) VALUES (:u, :ph, :a)",
            {"u": u, "ph": ph, "a": 1 if is_admin else 0})
        return True, "创建成功"

    # [New] 删除用户
    @classmethod
    def delete_user(cls, u: str) -> Tuple[bool, str]:
        # 删除用户 (Permission 表有外键吗？通常建议一起删，这里手动处理)
        try:
            with DBClient.atomic_transaction() as conn:
                conn.execute(text(f"DELETE FROM `{cls.PERM_TABLE}` WHERE username=:u"), {"u": u})
                conn.execute(text(f"DELETE FROM `{cls.USER_TABLE}` WHERE username=:u"), {"u": u})
            return True, "User deleted"
        except Exception as e:
            return False, str(e)

    @classmethod
    def reset_password(cls, u, np) -> Tuple[bool, str]:
        """重置密码并刷新 session token (强制已登录用户登出)"""
        ph = SecurityUtils.hash_password(np)
        new_token = SecurityUtils.generate_token()  # 生成新 token，使旧 session 失效
        row = DBClient.execute_stmt(
            f"UPDATE `{cls.USER_TABLE}` SET password_hash=:ph, failed_attempts=0, session_token=:t WHERE username=:u", 
            {"ph": ph, "u": u, "t": new_token})
        return (True, "重置成功") if row else (False, "用户不存在")

    @classmethod
    def set_lock_state(cls, u, lock) -> Tuple[bool, str]:
        """锁定/解锁用户。锁定时刷新 token 强制登出。"""
        if lock:
            # 锁定时刷新 token，强制该用户立即被登出
            new_token = SecurityUtils.generate_token()
            row = DBClient.execute_stmt(
                f"UPDATE `{cls.USER_TABLE}` SET is_locked=1, session_token=:t WHERE username=:u",
                {"t": new_token, "u": u})
        else:
            row = DBClient.execute_stmt(
                f"UPDATE `{cls.USER_TABLE}` SET is_locked=0 WHERE username=:u",
                {"u": u})
        return (True, "更新成功") if row else (False, "用户不存在")

    @classmethod
    def set_permissions(cls, u, pmap):
        try:
            with DBClient.atomic_transaction() as conn:
                # 1. Clear existing
                conn.execute(text(f"DELETE FROM `{cls.PERM_TABLE}` WHERE username=:u"), {"u": u})
                
                # 2. Insert new (Batch)
                if pmap:
                    # Construct list of dicts for executemany
                    data = [{"u": u, "k": k} for k in pmap]
                    
                    # [Fix] Use standard parameter binding for batch insert
                    sql = f"INSERT INTO `{cls.PERM_TABLE}` (username, permission_key, allowed) VALUES (:u, :k, 1)"
                    conn.execute(text(sql), data)
                    
            cls._logger.info(f"权限变更成功 | User: {u} | Count: {len(pmap)}")
        except Exception as e:
            cls._logger.error(f"权限变更失败 | User: {u} | Error: {str(e)}")
            raise e

    @classmethod
    def get_user_login_stats(cls, username: str) -> Dict[str, Any]:
        cnt_df = DBClient.read_df(f"SELECT COUNT(*) FROM `{cls.LOGIN_HISTORY_TABLE}` WHERE username=:u",
                                  {"u": username})
        cnt = cnt_df.iloc[0, 0] if not cnt_df.empty else 0
        hist = DBClient.read_df(
            f"SELECT ip_address, COUNT(*) as count, MAX(login_at) as last_seen FROM `{cls.LOGIN_HISTORY_TABLE}` WHERE username=:u GROUP BY ip_address ORDER BY count DESC",
            {"u": username})
        return {"total_logins": int(cnt), "ip_history": hist}