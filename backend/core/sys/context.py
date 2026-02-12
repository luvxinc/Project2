# File: core/sys/context.py
"""
文件说明: 全局请求/用户上下文管理 (Request / User Context) - V3.0 Traceability
修改记录:
[V3.0] 2025-12-13 (ISO Update)
1. [Add] trace_id: 新增全链路追踪 ID (UUID)，用于关联业务操作、底层SQL和系统报错。
2. [Mod] set_context: 支持 trace_id 的注入和自动生成。
"""

from dataclasses import dataclass, field
from typing import Optional, Dict
import contextvars
import uuid


@dataclass
class RequestContext:
    """
    [上下文模型]
    存储当前请求的元数据，用于全链路追踪 (ISO Traceability)。
    确保在多层调用中无需显式传递这些参数。
    """
    username: Optional[str] = None  # 当前操作人
    ip: Optional[str] = None  # 来源 IP
    session_id: Optional[str] = None  # Web Session ID
    function: Optional[str] = "System"  # 当前功能模块名
    trace_id: Optional[str] = None  # [New] 全链路追踪码 (UUID)
    extra: Dict[str, str] = field(default_factory=dict)  # 扩展字段


# 上下文存储容器 (线程/协程隔离)
# 默认值为空上下文，防止未初始化时报错
_current_ctx: contextvars.ContextVar[RequestContext] = contextvars.ContextVar(
    "current_request_context",
    default=RequestContext()
)


def set_context(username: Optional[str] = None,
                ip: Optional[str] = None,
                session_id: Optional[str] = None,
                function: Optional[str] = None,
                trace_id: Optional[str] = None,  # [New] 允许外部注入
                extra: Optional[Dict[str, str]] = None) -> None:
    """
    [入口] 设置当前上下文 (支持增量更新)

    逻辑说明:
    1. 获取当前已有的上下文。
    2. 如果参数传入了新值，则覆盖旧值；否则保留旧值。
    3. [ISO] 如果当前没有 trace_id 且未传入，则自动生成一个新的 UUID，确保每个操作都有据可查。
    """
    old = _current_ctx.get()

    # 自动生成 Trace ID (ISO Requirement: Uniquely Identify Every Transaction)
    # 优先级: 传入参数 > 现有上下文 > 自动生成
    final_trace_id = trace_id if trace_id is not None else old.trace_id
    if not final_trace_id:
        final_trace_id = str(uuid.uuid4())

    ctx = RequestContext(
        username=username if username is not None else old.username,
        ip=ip if ip is not None else old.ip,
        session_id=session_id if session_id is not None else old.session_id,
        function=function if function is not None else old.function,
        trace_id=final_trace_id,
        extra=extra or old.extra
    )

    # 将新上下文推入存储
    _current_ctx.set(ctx)


def set_current_function(name: str):
    """
    [快捷方式] 标记当前功能模块
    通常在 View 或 Service 的入口处调用，用于审计日志中的 'Module/Func' 字段。
    """
    set_context(function=name)


def get_context() -> RequestContext:
    """[获取] 获取当前完整的上下文对象"""
    return _current_ctx.get()


def get_request_id() -> str:
    """获取当前请求 ID"""
    tid = _current_ctx.get().trace_id
    # 兜底：如果未初始化 Context，临时生成一个，确保不报错
    return tid if tid else str(uuid.uuid4())


def get_trace_id() -> str:
    """[Alias] 获取 Trace ID (与 Request ID 相同)"""
    return get_request_id()


def get_current_user() -> str:
    """[快捷方式] 获取当前用户名 (兜底为 System)"""
    user = _current_ctx.get().username
    return user if user else "System"


def set_current_user(username: str) -> None:
    """[快捷方式] 设置当前用户名"""
    set_context(username=username)


def get_current_trace_id() -> str:
    """
    [快捷方式] 获取当前追踪码
    用于日志记录器 (Logger) 或 前端回显 (Ref ID)。
    """
    tid = _current_ctx.get().trace_id
    # 兜底：如果未初始化 Context，临时生成一个，确保不报错
    return tid if tid else str(uuid.uuid4())


def clear_context() -> None:
    """
    [清理] 重置上下文
    通常在请求结束或 Session 销毁时调用，防止数据污染。
    """
    _current_ctx.set(RequestContext())