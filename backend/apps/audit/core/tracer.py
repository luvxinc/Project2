# File: backend/apps/audit/core/tracer.py
"""
# ==============================================================================
# 模块名称: 链路追踪工具 (Audit Tracer)
# ==============================================================================
#
# [Purpose / 用途]
# 管理全链路追踪 ID (Trace ID / Reference ID)。
# 确保一次前端请求触发的所有后端操作 (SQL, Log, Logic) 共享同一个唯一 ID。
#
# [Architecture / 架构]
# - Layer: Core Helper
# - Dependencies: core.sys.context (Thread Local Storage)
#
# [Usage / 用法]
# - 获取当前 ID: AuditTracer.get_current_ref()
# - 生成新 ID: AuditTracer.generate_new_ref()
#
# ==============================================================================
"""

import uuid
from backend.core.sys.context import get_current_trace_id


class AuditTracer:

    @staticmethod
    def get_current_ref() -> str:
        """
        获取当前操作的 Reference Number。
        优先从 Context 获取，确保一次请求内的所有日志共享同一个 Ref。
        """
        return get_current_trace_id()

    @staticmethod
    def generate_new_ref() -> str:
        """强制生成一个新的 Ref (用于后台任务起点)"""
        return str(uuid.uuid4())