# File: backend/apps/audit/core/masker.py
"""
# ==============================================================================
# 模块名称: 敏感信息脱敏器 (Data Masker)
# ==============================================================================
#
# [Purpose / 用途]
# 在日志存储或展示前，对敏感数据进行动态脱敏。
# 保护个人隐私 (PII) 和系统机密 (Secrets) 不泄露给低权限用户。
#
# [Architecture / 架构]
# - Layer: Presentation Logic
# - Strategies:
#   - mask_path: 隐藏服务器物理路径
#   - mask_strict: 强锁定 (******) 用于 SQL/密码
#   - mask_sensitive_info: 正则清洗 Token/Key
#
# [ISO Compliance / 合规性]
# - 隐私保护: 确保 PII (Personally Identifiable Information) 不直接暴露。
# - 最小权限: 只有 God Mode (最高管理员) 才能查看原始敏感数据。
#
# ==============================================================================
"""

import re
from backend.common.settings import settings


class AuditMasker:
    RE_TOKEN = re.compile(r'(token|secret|password|pwd|key)=["\']?([a-zA-Z0-9_\-\.]+)["\']?', re.IGNORECASE)

    @staticmethod
    def mask_path(text: str) -> str:
        """隐藏服务器绝对路径 (用于非锁定字段的常规清洗)"""
        if not text: return ""
        base_dir = str(settings.BASE_DIR)
        if base_dir in text:
            return text.replace(base_dir, "[ROOT]")
        return text

    @staticmethod
    def mask_strict(text: str, is_god_mode: bool) -> str:
        """
        [核心] 严格锁定模式
        非上帝模式下，直接隐藏所有内容。
        """
        if not text or text == "-": return "-"

        if is_god_mode:
            return text

        return "****** (LOCKED)"

    @staticmethod
    def mask_sensitive_info(text: str, is_god_mode: bool = False) -> str:
        """
        [常规] 普通脱敏 (用于未被锁定的字段，如 Business Message)
        仅隐藏 Token 和 Path，保留大致内容。
        """
        if not text: return ""

        # 1. 路径脱敏
        clean_text = AuditMasker.mask_path(text)
        # 2. Token 脱敏
        clean_text = AuditMasker.RE_TOKEN.sub(r'\1=******', clean_text)

        return clean_text

    # =========================================================================
    # [方案A] Target 字段展示层别名脱敏
    # =========================================================================
    
    # 业务别名映射表（展示层使用，不影响存储）
    # 注意：更具体的 pattern 应该放在前面（长度长的优先）
    TARGET_ALIAS_MAP = [
        # (alias, patterns) - 按 pattern 长度从长到短排序
        ("STRATEGY", ["in_supplier_strategy", "supplierstrategy", "strategy"]),
        ("SUP", ["in_supplier", "supplier"]),
        ("INV", ["data_inventory", "inventory", "inv"]),
        ("COGS", ["data_cogs", "cogs"]),
        ("CLEAN", ["data_clean_log", "clean"]),
        ("LOCK", ["system_locks", "locks"]),
        # [REMOVED] ROLLBACK alias deprecated 2026-02-04
        ("AUDIT", ["auditlog", "audit_log"]),
        ("POLICY", ["securitypolicy", "policy"]),
    ]

    @classmethod
    def _match_alias(cls, target: str) -> str:
        """匹配 target 到业务别名（展示层用）"""
        if not target or target == "-":
            return "-"
        
        target_lower = target.lower()
        
        for alias, patterns in cls.TARGET_ALIAS_MAP:
            for pattern in patterns:
                if pattern in target_lower:
                    return alias
        
        # 备份文件名（.sql 结尾）
        if ".sql" in target_lower:
            return "BACKUP"
        
        return "OTHER"

    @staticmethod
    def mask_target(target: str, is_god_mode: bool) -> str:
        """
        [方案A] Target 字段展示层脱敏
        - 上帝模式：返回原始 target（完整明文），不做任何处理
        - 普通模式：返回业务别名（INV/COGS/CLEAN/SUP/STRATEGY/OTHER）
        
        注意：此函数仅影响展示层，不影响 audit.log 存储
        """
        if not target or target == "-":
            return "-"
        
        # 上帝模式：完整透传原文
        if is_god_mode:
            return target
        
        # 普通模式：返回别名
        return AuditMasker._match_alias(target)