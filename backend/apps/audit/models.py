# File: backend/apps/audit/models.py
"""
# ==============================================================================
# 模块名称: 审计日志数据模型 (Audit Models)
# ==============================================================================
#
# [Purpose / 用途]
# 定义全站审计日志 (AuditLog) 和 故障修复状态 (SystemLogPatch) 的数据库结构。
# 它是系统的核心合规组件，用于记录 "Who did What to Whom, When and Result".
#
# [Architecture / 架构]
# - Layer: Data Layer (Models)
# - Dependencies: Django Models
#
# [ISO Compliance / 合规性]
# - 完整性: 记录操作人、IP、时间戳、目标对象(Target)、操作类型(Action)、变更详情(Changes)。
# - 可追溯: 所有写操作必须有对应的 AuditLog。
# - 不可篡改: 审计日志设计为只增不改 (Append Only)。
#
# ==============================================================================
"""
from django.db import models
from django.utils import timezone

class AuditLog(models.Model):
    # Standard Fields
    ref_id = models.CharField("REF ID", max_length=64, unique=True, null=True, blank=True)  # System generated unique ID
    actor = models.CharField("操作人", max_length=64, null=True, blank=True)
    ip_address = models.GenericIPAddressField("IP地址", null=True, blank=True)

    # Page Hierarchy: Left Nav -> Tab -> Button
    page_hierarchy = models.CharField("页面层级", max_length=255, null=True, blank=True)
    
    target_app = models.CharField("目标应用", max_length=64)
    target_model = models.CharField("目标模型", max_length=64)
    target_id = models.CharField("目标ID", max_length=64)

    ACTION_CHOICES = [
        ('VIEW', '查看页面'),
        ('QUERY', '查询数据'),
        ('MODIFY', '修改数据'),
        ('DELETE', '删除数据'),
        ('ADD', '新增数据'),
        ('QUERY_SET', '查询设置'),
        ('MODIFY_SET', '修改设置'),
        ('DELETE_SET', '删除设置'),
        ('ADD_SET', '新增设置'),
        ('START', '启动功能'),
        ('LOGIN', '登入'),
        ('LOGOUT', '登出'),
        ('PURGE', '清空日志'),
        ('ROLLBACK', '数据回滚'),
        ('GOD_MODE', '上帝模式'),
        ('LOCK', '锁定账户'),
        ('UNLOCK', '解锁账户'),
        ('PROMOTE', '提升权限'),
        ('DEMOTE', '降低权限'),
    ]
    action = models.CharField("动作", max_length=32, choices=ACTION_CHOICES)

    status = models.CharField("状态", max_length=32, default="Success")
    
    # Root Cause: System, Permissions, Data, UI, Other
    root_cause = models.CharField("失败根因", max_length=32, blank=True, null=True)
    
    # Type: Regular or Permanent
    log_type = models.CharField("日志类型", max_length=16, default="Regular")
    
    note = models.TextField("备注", blank=True, null=True)

    changes = models.JSONField("变更详情", default=dict) # UI Details: Before -> After
    underlying_data = models.JSONField("底层数据", default=dict) # SQL/JSON interactions
    snapshot_path = models.CharField("快照路径", max_length=255, blank=True, null=True) # For rollback

    timestamp = models.DateTimeField("操作时间", default=timezone.now)

    class Meta:
        db_table = 'System_Audit_Log_Django'
        verbose_name = '审计日志'
        verbose_name_plural = '审计日志'
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp}] {self.actor} {self.action} {self.target_model}"


class SystemLogPatch(models.Model):
    """
    [新增] 系统故障修复状态表
    用于关联 error.log 中的 Trace ID 与修复版本。
    """
    trace_id = models.CharField("Trace ID", max_length=64, unique=True, db_index=True)
    patched_version = models.CharField("修复版本", max_length=32)  # e.g., "V1.0.1" 或 "Ignore"
    patched_at = models.DateTimeField("标记时间", auto_now=True)
    patched_by = models.CharField("标记人", max_length=64)

    class Meta:
        db_table = 'System_Error_Patch_Status'
        verbose_name = '故障修复状态'
        verbose_name_plural = '故障修复状态'