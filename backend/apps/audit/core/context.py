# File: backend/apps/audit/core/context.py
"""
# ==============================================================================
# 模块名称: 审计上下文管理器 (Audit Context)
# ==============================================================================
#
# [Purpose / 用途]
# 基于 ContextVars 的线程隔离上下文，用于在请求生命周期内传递审计元数据。
# 解决了深度调用链中 (Service -> DB -> Logger) 无法透传 User/TraceID 的痛点。
#
# [Architecture / 架构]
# - Layer: Core Infrastructure (Context)
# - Technology: Python 3.7+ contextvars (Asyncio Safe)
# - Scope: Request Lifecycle (Middleware Init -> View -> Service -> DB)
#
# [ISO Compliance / 合规性]
# - 责任归属: 确保每一条底层日志都能精确关联到上层发起人 (User) 和 来源 IP。
# - 链路完整性: 通过 Trace ID 串联所有操作，形成完整的证据链。
#
# ==============================================================================
"""
import uuid
import contextvars
from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class AuditContext:
    """
    [Global Context] 存储当前请求周期的审计上下文
    """
    trace_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    username: str = "System"
    ip: str = "0.0.0.0"

    # [New] 页面层级堆栈 (用于生成 Page 字段: "A->B->C")
    # 格式: ["用户管理", "用户列表", "创建用户"]
    page_stack: List[str] = field(default_factory=list)

    # [New] 上帝模式标记
    is_god_mode: bool = False

    # [Phase 0] 事件ID (动作级别标识，用于串联同一次业务动作的多条日志)
    event_id: Optional[str] = None


_audit_ctx = contextvars.ContextVar("audit_context", default=AuditContext())


class AuditContextManager:
    @staticmethod
    def init_context(username: str, ip: str, trace_id: Optional[str] = None):
        """初始化上下文 (通常在 Middleware 调用)"""
        ctx = AuditContext(
            trace_id=trace_id or str(uuid.uuid4()),
            username=username,
            ip=ip,
            page_stack=[]
        )
        _audit_ctx.set(ctx)

    @staticmethod
    def get_current() -> AuditContext:
        return _audit_ctx.get()

    @staticmethod
    def get_trace_id() -> str:
        return _audit_ctx.get().trace_id

    # --- Page Hierarchy Logic ---
    @staticmethod
    def push_page_level(level_name: str):
        """压入页面层级 (e.g., 进入 Tab)"""
        ctx = _audit_ctx.get()
        # 避免重复压入相同层级
        if not ctx.page_stack or ctx.page_stack[-1] != level_name:
            ctx.page_stack.append(level_name)

    @staticmethod
    def set_page_hierarchy(levels: List[str]):
        """强制设置层级 (e.g., 明确知道当前在 "Nav->Tab->Action")"""
        _audit_ctx.get().page_stack = levels

    @staticmethod
    def get_page_display() -> str:
        """生成 Page 字段字符串: '用户管理 -> 用户列表 -> 创建'"""
        stack = _audit_ctx.get().page_stack
        if not stack:
            return "系统后台"
        return " -> ".join(stack)

    # --- God Mode ---
    @staticmethod
    def set_god_mode(enabled: bool):
        _audit_ctx.get().is_god_mode = enabled

    @staticmethod
    def is_god_mode() -> bool:
        return _audit_ctx.get().is_god_mode

    # --- [Phase 0] Event ID ---
    @staticmethod
    def set_event_id(event_id: str):
        """设置当前请求上下文的 event_id"""
        _audit_ctx.get().event_id = event_id

    @staticmethod
    def get_event_id() -> Optional[str]:
        """获取当前 event_id"""
        return _audit_ctx.get().event_id

    @staticmethod
    def clear_event_id():
        """清除当前 event_id"""
        _audit_ctx.get().event_id = None