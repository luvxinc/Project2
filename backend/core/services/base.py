# File: backend/core/services/base.py
"""
# ==============================================================================
# 模块名称: 服务基类 (Base Service)
# ==============================================================================
#
# [Purpose / 用途]
# 所有领域服务 (Domain Service) 的基类。
# 提供统一的上下文注入 (Logger, Context) 和事务管理能力。
#
# [Architecture / 架构]
# - Layer: Domain Layer
# - Capabilities:
#   - Logger Automation: 自动以类名命名 Logger。
#   - Context Awareness: 方便获取 request, user, trace_id。
#
# [ISO Compliance / 合规性]
# - 可追溯性: 服务执行必须关联 Trace ID。
#
# ==============================================================================
"""

import time
from typing import Optional
from backend.core.sys.logger import get_logger
from core.sys.context import get_current_user, get_trace_id

class BaseService:
    def __init__(self, context: Optional[dict] = None):
        """
        初始化服务
        :param context: 可选的上下文传递 (如 Request Context)
        """
        self.class_name = self.__class__.__name__
        self.logger = get_logger(self.class_name)
        self.context = context or {}
        self._start_time = None

    def log(self, message: str, level: str = "info"):
        """统一日志记录封装"""
        extra = {"trace_id": get_trace_id(), "user": get_current_user()}
        if level.lower() == "error":
            self.logger.error(message, extra=extra)
        elif level.lower() == "warning":
            self.logger.warning(message, extra=extra)
        else:
            self.logger.info(message, extra=extra)

    def start_timer(self):
        """开始计时"""
        self._start_time = time.time()

    def end_timer(self, operation_name: str = "Operation"):
        """结束计时并记录"""
        if self._start_time:
            elapsed = time.time() - self._start_time
            self.log(f"⏱️ {operation_name} completed in {elapsed:.4f}s")
            self._start_time = None

    def run(self, *args, **kwargs):
        """
        [Optional] 标准执行入口，子类可覆盖
        """
        raise NotImplementedError("Service must implement generic 'run' or specific methods.")
