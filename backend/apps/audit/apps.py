"""
# ==============================================================================
# 模块名称: 审计模块应用配置 (Audit App Config)
# ==============================================================================
#
# [Purpose / 用途]
# Django App 的入口配置类。
# 负责在 App 启动 (Ready 阶段) 初始化关键组件，如信号监听器 (Signals)。
#
# [Architecture / 架构]
# - Layer: Configuration
# - Trigger: Django Startup -> AppRegistry
#
# [ISO Compliance / 合规性]
# - 初始化完整性: 确保所有旁路监听器 (Signals) 在服务启动时正确挂载，避免审计漏记。
#
# ==============================================================================
"""
from django.apps import AppConfig

class AuditConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backend.apps.audit'

    def ready(self):
        # [关键] 启动时导入 signals，否则监听器不会生效
        # 修复红线：使用相对导入
        from . import signals