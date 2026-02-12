# File: core/sys/oplog.py
from __future__ import annotations
from typing import Any, Dict, Optional

def attach_oplog(
    request,
    *,
    module: Optional[str] = None,
    tab: Optional[str] = None,
    op: Optional[str] = None,
    action: Optional[str] = None,
    func: Optional[str] = None,
    target: Optional[str] = None,
    ref_required: Optional[bool] = None,
    changes: Optional[Dict[str, Any]] = None,
    note: Optional[Any] = None,
    msg: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    root_cause: Optional[str] = None,
    **kwargs
) -> None:
    """
    在 request 上挂载业务语义信息。
    """
    payload = getattr(request, "_oplog", {}) or {}

    if module is not None: payload["module"] = module
    if tab is not None: payload["tab"] = tab
    if op is not None: payload["op"] = op
    if action is not None: payload["action"] = action
    if func is not None: payload["func"] = func
    if target is not None: payload["target"] = target
    if ref_required is not None: payload["ref_required"] = bool(ref_required)
    if changes is not None: payload["changes"] = changes
    if note is not None: payload["note"] = note
    if msg is not None: payload["msg"] = msg
    if type is not None: payload["type"] = type
    # [Fix]
    if status is not None: payload["status"] = status
    if root_cause is not None: payload["root_cause"] = root_cause

    request._oplog = payload