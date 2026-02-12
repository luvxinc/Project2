# File: backend/apps/audit/core/dto.py
"""
# ==============================================================================
# 模块名称: 审计数据传输对象 (Audit DTOs)
# ==============================================================================
#
# [Purpose / 用途]
# 定义审计日志的内存数据结构 (Data Transfer Objects)。
# 用于统一 File Log (App/System) 和 DB Log (AuditLog) 的格式，以便前端渲染。
#
# [Architecture / 架构]
# - Layer: Data Structure
# - Class: LogEntry
#
# [ISO Compliance / 合规性]
# - 标准化: 强制统一日志格式 (Time, User, Action, etc.)，消除异构数据的解析歧义。
#
# ==============================================================================
"""
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List

class LogStatus:
    """ISO 8601 操作结果状态标准"""
    SUCCESS = "Success"
    FAIL_PERM = "Failed(Permission)"  # 无权限
    FAIL_DATA = "Failed(Data)"        # 数据校验不通过
    FAIL_SYS = "Failed(System)"       # 系统/代码异常
    FAIL_UI = "Failed(UI)"            # 前端交互异常
    FAIL_OTHER = "Failed(Other)"      # 其他原因

class LogType:
    """数据留存级别"""
    PERMANENT = "Permanent"  # 永久保留 (如删库、清空日志、核心配置变更)
    REGULAR = "Regular"      # 常规轮替

class LogSource:
    """日志来源"""
    DB = "DB"
    FILE = "FILE"

@dataclass
class LogEntry:
    """
    [Core DTO] 统一审计日志条目
    贯穿 Business, Infra, System 三层日志的标准载体。
    """
    # --- 1. 溯源信息 (Traceability) ---
    time: str               # ISO 时间
    reference: str          # 全链路 Trace ID (三表联动唯一键)
    user: str               # 操作人
    ip: str                 # 来源 IP
    source: str = LogSource.FILE
    event_id: str = "-"     # [Phase 0] 事件ID (动作级别标识)

    # --- 2. 业务语境 (Business Context) ---
    page: str = "-"         # [New] 操作路径: 导航 -> Tab -> 按钮 (e.g., "用户管理->列表->删除")
    func: str = "-"         # 代码模块 (e.g., "UserAdmin:Delete")
    action: str = "-"       # 标准动词 (e.g., "删除数据")
    target: str = "-"       # 作用对象 (User/Table)

    # --- 3. 结果与诊断 (Diagnostics) ---
    status: str = LogStatus.SUCCESS
    root_cause: str = "-"   # [New] 失败根因 (仅 Failed 时必填)
    details: str = ""       # 详细变更 (Before -> After)

    # --- 4. 底层与维护 (Infra & Ops) ---
    sql: str = ""           # [New] 执行的 SQL 语句 (Infra Only)
    snapshot_id: str = ""   # [New] 回滚快照 ID (指向 backup/goback/REF.csv)
    note: str = ""          # [New] 备注 / 下载备份链接
    type: str = LogType.REGULAR

    # --- 5. 系统专用 ---
    patched_ver: str = ""   # [New] 修复版本号 (System Only)
    raw_line: str = ""      # 原始日志行 (用于文件读取时的缓存)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "time": self.time,
            "reference": self.reference,
            "event_id": self.event_id,
            "user": self.user,
            "ip": self.ip,
            "source": self.source,
            "page": self.page,
            "func": self.func,
            "action": self.action,
            "target": self.target,
            "status": self.status,
            "root_cause": self.root_cause,
            "details": self.details,
            "sql": self.sql,
            "snapshot_id": self.snapshot_id,
            "note": self.note,
            "type": self.type,
            "patched_ver": self.patched_ver,
            "raw_line": self.raw_line
        }


@dataclass
class UnifiedEvent:
    """
    [Phase 2.1] 统一事件模型
    将多个 LogEntry 聚合为一个业务事件
    """
    # --- 1. 事件标识 ---
    event_key: str          # 聚合键 (event_id 或 reference+user+time_bucket)
    reference: str          # 主 reference
    event_id: str           # 事件 ID
    
    # --- 2. 用户信息 ---
    user: str
    ip: str
    
    # --- 3. 业务语境 ---
    page: str               # 功能路径
    action: str             # 主要动作
    target: str             # 主要目标
    
    # --- 4. 时间范围 ---
    first_time: str         # 最早时间
    last_time: str          # 最晚时间
    
    # --- 5. 状态汇总 ---
    status: str             # 汇总状态 (任意 Failed -> Failed)
    root_cause: str = "-"   # 首个失败原因
    
    # --- 6. 日志条目 ---
    entries: list = field(default_factory=list)  # List[LogEntry]
    counts_by_source: Dict[str, int] = field(default_factory=dict)  # {"app": 1, "audit": 2, "error": 0}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_key": self.event_key,
            "reference": self.reference,
            "event_id": self.event_id,
            "user": self.user,
            "ip": self.ip,
            "page": self.page,
            "action": self.action,
            "target": self.target,
            "first_time": self.first_time,
            "last_time": self.last_time,
            "status": self.status,
            "root_cause": self.root_cause,
            "entry_count": len(self.entries),
            "counts_by_source": self.counts_by_source,
            "entries": [e.to_dict() for e in self.entries]
        }