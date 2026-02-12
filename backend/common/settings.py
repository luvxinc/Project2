# config/settings.py
"""
文件说明: 全局配置中心 (Settings)
主要功能:
1. 路径定义与环境加载。
2. 数据库连接字符串生成。
3. [V5 Upgrade] 加载企业级安全码 (Security Codes)。
4. [V5 Upgrade] 指向 action_registry.json (动作注册表)。
"""

import os
import json
import re
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 环境变量
load_dotenv()


class Settings:
    # =========================================================================
    # 1. 路径定义 (Path Definitions)
    # =========================================================================
    # Points to MGMT root (common -> backend -> MGMT)
    BASE_DIR = Path(__file__).resolve().parent.parent.parent

    CONFIG_DIR = BASE_DIR / "backend" / "common"
    LOG_DIR = BASE_DIR / "logs"

    # ===========================================
    # 数据目录定义 (统一 data/ 根目录) v2.0
    # ===========================================
    DATA_DIR = BASE_DIR / "data"

    # --- 业务记录 ---
    RECORDS_DIR = DATA_DIR / "records"

    # --- 用户导出 ---
    EXPORTS_DIR = DATA_DIR / "exports"
    REPORTS_EXPORT_DIR = EXPORTS_DIR / "reports"    # 报表导出
    DB_EXPORT_DIR = EXPORTS_DIR / "db"              # 数据库导出

    # --- 系统备份 ---
    BACKUPS_DIR = DATA_DIR / "backups"
    DB_BACKUP_DIR = BACKUPS_DIR / "db"              # 数据库备份
    # [REMOVED] ROLLBACK_DIR deprecated 2026-02-04
    LOG_ARCHIVE_DIR = BACKUPS_DIR / "logs"          # 日志归档
    SNAPSHOT_DIR = BACKUPS_DIR / "snapshots"        # 完整快照

    # --- 缓存 (可清理) ---
    CACHE_DIR = DATA_DIR / "cache"
    RESTORE_TEMP_DIR = CACHE_DIR / "restore"

    # --- 其他数据目录 ---
    BARCODE_DIR = DATA_DIR / "barcodes"
    TEMPLATE_CSV_DIR = DATA_DIR / "templates_csv"
    ARCHIVE_DIR = DATA_DIR / "archive"
    KNOWLEDGE_BASE_DIR = DATA_DIR / "knowledge_base"
    CHAT_HISTORY_DIR = DATA_DIR / "chat_history"

    # --- 兼容别名 (Deprecated, 保留向后兼容) ---
    BACKUPS_ROOT = BACKUPS_DIR                # 旧代码兼容
    BACKUP_DIR = EXPORTS_DIR                  # 旧代码兼容
    USER_EXPORT_DIR = EXPORTS_DIR             # 旧代码兼容
    OUTPUT_DIR = REPORTS_EXPORT_DIR           # 旧代码兼容

    # 自动创建目录
    for _dir in [DATA_DIR, LOG_DIR, RECORDS_DIR, EXPORTS_DIR, REPORTS_EXPORT_DIR, 
                 DB_EXPORT_DIR, BACKUPS_DIR, DB_BACKUP_DIR, 
                 LOG_ARCHIVE_DIR, SNAPSHOT_DIR, CACHE_DIR, RESTORE_TEMP_DIR,
                 BARCODE_DIR, TEMPLATE_CSV_DIR, ARCHIVE_DIR, KNOWLEDGE_BASE_DIR, 
                 CHAT_HISTORY_DIR]:
        _dir.mkdir(parents=True, exist_ok=True)

    # =========================================================================
    # 2. 版本与元数据
    # =========================================================================
    APP_NAME = "Eaglestar ERP Enterprise"
    APP_VERSION = "V2.0.0 (Dev)"
    VERSION_DATE = "Unknown Date"
    AUTHOR = "Aaron"

    PATCH_NOTES_FILE = BASE_DIR / "backend" / "patch_notes.txt"
    PATCH_NOTES_LIST = []

    # 全站管理员账号
    SUPER_ADMIN_USER = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")

    def __init__(self):
        self.load_version_info()

    def load_version_info(self):
        if not self.PATCH_NOTES_FILE.exists(): return
        try:
            with open(self.PATCH_NOTES_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
            blocks = content.split('\n\n')
            self.PATCH_NOTES_LIST = []
            for block in blocks:
                block = block.strip()
                if not block: continue
                if block.startswith("VERSION="):
                    self.APP_VERSION = block.split("=")[1].strip()
                    continue
                lines = block.split('\n', 1)
                if len(lines) < 2: continue
                header = lines[0].strip()
                desc = lines[1].strip()
                match = re.match(r"\[(.*?)\]\s+(.*)", header)
                if match:
                    ver, date_str = match.groups()
                    if ver == self.APP_VERSION:
                        self.VERSION_DATE = date_str
                    self.PATCH_NOTES_LIST.append({"ver": ver, "date": date_str, "desc": desc})
        except Exception as e:
            print(f" Error loading patch notes: {e}")

    # =========================================================================
    # 3. 数据库配置
    # =========================================================================
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", 3306))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASS = os.getenv("DB_PASS", "")
    DB_NAME = os.getenv("DB_NAME", "MGMT")
    DB_CHARSET = os.getenv("DB_CHARSET", "utf8mb4")

    @property
    def SQLALCHEMY_URL(self):
        # [Fix] 强制指定 collation 为 utf8mb4_unicode_ci，确保所有临时表与主表 collation 一致
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASS}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset={self.DB_CHARSET}"

    # =========================================================================
    # 4. [New] 企业级安全配置 (Security V5)
    # =========================================================================

    # --- A. 原始凭证 (From .env) ---
    SEC_CODE_QUERY = os.getenv("SEC_CODE_QUERY", "1111")  # L1: 查询
    SEC_CODE_MODIFY = os.getenv("SEC_CODE_MODIFY", "2222")  # L2: 修改
    SEC_CODE_DB = os.getenv("SEC_CODE_DB", "1522")  # L3: 运维
    SEC_CODE_SYSTEM = os.getenv("SEC_CODE_SYSTEM", "RedButton!")  # L4: 核心

    # --- B. 兼容旧版 (将在重构完成后废弃) ---
    DB_OPERATOR_PWD = SEC_CODE_DB
    PLATFORM_SEC_PWD = SEC_CODE_SYSTEM

    # --- C. 动作注册表路径 ---
    # 定义了 Module -> Tab -> Action 的全站层级
    ACTION_REGISTRY_FILE = CONFIG_DIR / "action_registry.json"

    # =========================================================================
    # 5. 业务参数
    # =========================================================================
    LEAD_MONTH = 2.0
    MIN_SAFETY_MONTH = 1.0
    LOSS_RATES = {"CASE": 0.6, "REQUEST": 0.5, "RETURN": 0.3, "DISPUTE": 1.0}

    @classmethod
    def load_modules_config(cls):
        """加载旧版模块配置 (UI 导航用)"""
        config_path = cls.CONFIG_DIR / "modules.json"
        if not config_path.exists(): return []
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f" Error loading modules.json: {e}")
            return []

    @classmethod
    def load_action_registry(cls):
        """[New] 加载动作注册表 (安全控制用)"""
        if not cls.ACTION_REGISTRY_FILE.exists(): return {}
        try:
            with open(cls.ACTION_REGISTRY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f" Error loading action_registry.json: {e}")
            return {}

# =========================================================================
    # 6. Session Security (新增)
    # =========================================================================
    # 默认 6 小时 (21600秒) 无操作自动登出
    AUTO_LOGOUT_SECONDS = int(os.getenv("AUTO_LOGOUT_SECONDS", 21600))

settings = Settings()