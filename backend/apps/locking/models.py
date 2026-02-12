# File: backend/apps/locking/models.py
"""
# ==============================================================================
# 模块名称: 分布式锁数据模型 (Locking Model)
# ==============================================================================
#
# [Purpose / 用途]
# 映射数据库中的全局锁表 (System_Locks)。
# 用于跨系统 (Django/Streamlit) 的资源互斥访问控制。
#
# [Architecture / 架构]
# - Data Source: Physical Table 'System_Locks'.
# - Management: Managed = False (Django 不负责迁移，防止破坏旧系统).
#
# [ISO Compliance / 合规性]
# - 一致性: 必须与 Legacy 系统共享相同的表结构。
#
# ==============================================================================
"""

from django.db import models


class SystemLock(models.Model):
    # 资源标识 (PK)，例如: "Data_Transaction", "SKU_NU1C8E51C"
    resource_key = models.CharField("资源Key", max_length=50, primary_key=True)

    # 锁定人，例如: "admin", "Aaron"
    locked_by = models.CharField("锁定人", max_length=64)

    # 锁定时间 (自动生成)
    locked_at = models.DateTimeField("锁定时间", auto_now_add=True)

    # 模块名称，例如: "Inventory", "ETL"
    module_name = models.CharField("所属模块", max_length=50, blank=True, null=True)

    class Meta:
        # [关键] 指向真实存在的物理表
        db_table = 'System_Locks'
        # [关键] 告诉 Django 不要尝试创建或修改这张表 (Zero Regression)
        managed = False
        verbose_name = '分布式锁'
        verbose_name_plural = '分布式锁监控'

    def __str__(self):
        return f"🔒 {self.resource_key} by {self.locked_by}"