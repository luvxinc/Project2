# File: backend/apps/audit/signals.py
"""
# ==============================================================================
# 模块名称: 审计信号监听器 (Audit Signals)
# ==============================================================================
#
# [Purpose / 用途]
# 实现"旁路监听" (Side-Car) 模式的审计记录。
# 通过订阅 Django 的 Signals (post_save, post_delete)，自动捕获数据变更。
#
# [Architecture / 架构]
# - Layer: Domain Logic (Observer)
# - Trigger: DB Operations (Save/Delete)
# - Output: Write to AuditLog Table
#
# [ISO Compliance / 合规性]
# - 自动化收集: 确保没有人为干预的余地，所有变更自动记录。
# - 完整性: 覆盖增删改 (CRUD) 全生命周期。
#
# ==============================================================================
"""

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.forms.models import model_to_dict
import json

# 引入我们需要监控的模型
from backend.apps.locking.models import SystemLock
from .models import AuditLog

# 定义需要监控的模型列表
WATCHED_MODELS = [SystemLock]


@receiver(post_save, sender=SystemLock)
def log_save(sender, instance, created, **kwargs):
    """监听保存/更新事件"""
    action = 'CREATE' if created else 'UPDATE'

    # 获取当前变更 (简化版，仅记录当前快照)
    # 生产环境通常会对比 __init__ 时的状态来计算 Diff
    try:
        data_snapshot = model_to_dict(instance)
        # 处理 datetime 无法序列化的问题
        if 'locked_at' in data_snapshot:
            data_snapshot['locked_at'] = str(data_snapshot['locked_at'])

        AuditLog.objects.create(
            target_app=sender._meta.app_label,
            target_model=sender._meta.model_name,
            target_id=str(instance.pk),
            action=action,
            changes=data_snapshot,
            actor=getattr(instance, 'locked_by', 'System')  # 尝试从实例获取操作人
        )
    except Exception as e:
        print(f"Audit Log Error: {e}")


@receiver(post_delete, sender=SystemLock)
def log_delete(sender, instance, **kwargs):
    """监听删除事件"""
    try:
        AuditLog.objects.create(
            target_app=sender._meta.app_label,
            target_model=sender._meta.model_name,
            target_id=str(instance.pk),
            action='DELETE',
            changes={"info": "Resource Released"},
            actor=getattr(instance, 'locked_by', 'System')
        )
    except Exception as e:
        print(f"Audit Log Error: {e}")