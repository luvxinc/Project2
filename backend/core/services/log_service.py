# File: backend/core/services/log_service.py
"""
# ==============================================================================
# 模块名称: 统一日志服务 (Log Service)
# ==============================================================================
#
# [Purpose / 用途]
# 系统的核心日志聚合器。负责从多种来源 (File, DB) 读取日志，并进行清洗、格式化和脱敏。
#
# [Architecture / 架构]
# - Layer: Core Service (Logging)
# - Sources:
#   - File: app.log (Business), error.log (System), audit.log (Infra)
#   - DB: AuditLog Table (Transactional)
#
# [ISO Compliance / 合规性]
# - 统一视图: 提供单一入口获取所有审计数据，消除数据孤岛。
# - 隐私屏障: 强制集成 AuditMasker，确保输出日志不包含明文 PII。
# - 可追溯性: Strict Log Format (Time | Ref | User | Page | Action ...)
#
# ==============================================================================
"""
import os
import re
import uuid
import datetime
import shutil
from typing import List, Optional, Dict, Any, Tuple
from django.utils import timezone
from django.db.models import Q

from backend.apps.audit.core.dto import LogEntry, LogStatus, LogType, LogSource
from backend.apps.audit.core.masker import AuditMasker
from backend.apps.audit.models import AuditLog
from backend.common.settings import settings


class LogService:
    # [Phase 2.2] V2 Pattern: 含 target 列
    # Format: Time | Ref ID | Event ID | User/IP | Page | Action | Target | Status | Root Cause | Details | Type | Note | Meta...
    LOG_PATTERN_V2 = re.compile(
        r"^(?P<ts>[^|]+)\s*\|\s*"
        r"(?P<ref>[^|]+)\s*\|\s*"
        r"(?P<event_id>[^|]+)\s*\|\s*"
        r"(?P<user_ip>[^|]+)\s*\|\s*"
        r"(?P<page>[^|]+)\s*\|\s*"
        r"(?P<action>[^|]+)\s*\|\s*"
        r"(?P<target>[^|]+)\s*\|\s*"
        r"(?P<status>[^|]+)\s*\|\s*"
        r"(?P<root_cause>[^|]+)\s*\|\s*"
        r"(?P<details>[^|]+)\s*\|\s*"
        r"(?P<type>[^|]+)\s*\|\s*"
        r"(?P<note>[^|]+)"
        r"(?:\s*\|\s*(?P<meta>.*))?$"
    )
    
    # [Phase 2.2] V1 Pattern: 不含 target 列（旧格式兼容）
    # Format: Time | Ref ID | Event ID | User/IP | Page | Action | Status | Root Cause | Details | Type | Note | Meta...
    LOG_PATTERN_V1 = re.compile(
        r"^(?P<ts>[^|]+)\s*\|\s*"
        r"(?P<ref>[^|]+)\s*\|\s*"
        r"(?P<event_id>[^|]+)\s*\|\s*"
        r"(?P<user_ip>[^|]+)\s*\|\s*"
        r"(?P<page>[^|]+)\s*\|\s*"
        r"(?P<action>[^|]+)\s*\|\s*"
        r"(?P<status>[^|]+)\s*\|\s*"
        r"(?P<root_cause>[^|]+)\s*\|\s*"
        r"(?P<details>[^|]+)\s*\|\s*"
        r"(?P<type>[^|]+)\s*\|\s*"
        r"(?P<note>[^|]+)"
        r"(?:\s*\|\s*(?P<meta>.*))?$"
    )
    
    # [Phase 2.2.1] Error.log 专用 Pattern
    # Format: Time | Ref ID | Event ID | User/IP | System | ERROR | Failed | System Error | Message | Type | Note | Loc
    LOG_PATTERN_ERROR = re.compile(
        r"^(?P<ts>[^|]+)\s*\|\s*"
        r"(?P<ref>[^|]+)\s*\|\s*"
        r"(?P<event_id>[^|]+)\s*\|\s*"
        r"(?P<user_ip>[^|]+)\s*\|\s*"
        r"(?P<page>[^|]+)\s*\|\s*"           # System
        r"(?P<action>[^|]+)\s*\|\s*"          # ERROR
        r"(?P<status_fixed>[^|]+)\s*\|\s*"    # Failed
        r"(?P<root_cause>[^|]+)\s*\|\s*"      # System Error
        r"(?P<message>[^|]+)\s*\|\s*"         # Message
        r"(?P<type>[^|]+)\s*\|\s*"            # Type
        r"(?P<note>[^|]+)"                    # Note
        r"(?:\s*\|\s*(?P<loc>.*))?$"          # Loc
    )

    @classmethod
    def generate_ref_id(cls, prefix: str = "REF") -> str:
        """生成唯一引用ID: REF-YYYYMMDD-UUID"""
        ts = datetime.datetime.now().strftime("%Y%m%d")
        uid = str(uuid.uuid4())[:8].upper()
        return f"{prefix}-{ts}-{uid}"

    @classmethod
    def _parse_kv_pairs(cls, meta_str: str) -> Dict[str, str]:
        if not meta_str: return {}
        kv = {}
        parts = [p.strip() for p in meta_str.split("|")]
        for p in parts:
            if "=" in p:
                k, v = p.split("=", 1)
                kv[k.strip()] = v.strip()
        return kv

    @classmethod
    def _parse_file_line(cls, line: str, is_god_mode: bool) -> Optional[LogEntry]:
        line = (line or "").rstrip("\n")
        if not line.strip(): return None

        # [Phase 3.2] 格式检测：通过第7列（index 6）内容判断
        # V1: 第7列是 Status（Success/Failed/-/Denied 等）
        # V2: 第7列是 Target（不应该是状态词）
        fields = [f.strip() for f in line.split("|")]
        
        parse_mode = "FALLBACK"
        has_target = False
        m = None
        
        STATUS_LIKE_VALUES = {"Success", "Failed", "-", "Denied", "Unknown", "Failed(System)"}
        
        if len(fields) >= 12:
            field_7 = fields[6] if len(fields) > 6 else ""
            
            # 如果第7列像是状态值，则是 V1 格式
            if field_7 in STATUS_LIKE_VALUES or field_7.startswith("Failed"):
                m = cls.LOG_PATTERN_V1.match(line)
                if m:
                    parse_mode = "V1"
                    has_target = False
            else:
                # 第7列不像状态值，尝试 V2
                m = cls.LOG_PATTERN_V2.match(line)
                if m:
                    parse_mode = "V2"
                    has_target = True
        
        # Fallback：如果上述判断失败，尝试另一个 pattern
        if not m:
            m = cls.LOG_PATTERN_V2.match(line)
            if m:
                parse_mode = "V2-FB"
                has_target = True
            else:
                m = cls.LOG_PATTERN_V1.match(line)
                if m:
                    parse_mode = "V1-FB"
                    has_target = False
        
        if not m:
            if is_god_mode:
                return LogEntry(
                    time=line[:19] if len(line)>19 else "Unknown",
                    reference="LEGACY",
                    user="System",
                    ip="-",
                    source=LogSource.FILE,
                    func="-", page="Raw Log", action="PARSE_ERROR",
                    status=LogStatus.FAIL_SYS, root_cause="Format",
                    type=LogType.REGULAR, snapshot_id="-", sql="-",
                    details=f"[PARSE:FAIL] {line[:100]}", note="Format Mismatch", raw_line=line
                )
            return None

        user_ip = m.group("user_ip").strip()
        if "/" in user_ip:
            user, ip = user_ip.split("/", 1)
        else:
            user, ip = user_ip, "-"

        raw_details = m.group("details").strip()
        meta = cls._parse_kv_pairs(m.group("meta"))
        
        masked_details = AuditMasker.mask_sensitive_info(raw_details, is_god_mode)
        
        # [Phase 2.2] V1 兼容：target 固定为 "-"
        target = m.group("target").strip() if has_target and m.group("target") else "-"
        
        # [Phase 3.2] 添加解析来源标记到 details
        details_with_prefix = f"[PARSE:{parse_mode}] {masked_details}"

        return LogEntry(
            time=m.group("ts").strip(),
            reference=m.group("ref").strip(),
            user=user.strip(),
            ip=ip.strip(),
            source=LogSource.FILE,
            event_id=m.group("event_id").strip() if m.group("event_id") else "-",

            func="-", 
            page=m.group("page").strip(),
            
            action=m.group("action").strip(),
            target=AuditMasker.mask_target(target, is_god_mode),
            
            status=m.group("status").strip(),
            root_cause=m.group("root_cause").strip(),
            
            type=m.group("type").strip(),
            note=m.group("note").strip(),

            snapshot_id=meta.get("snapshot", "-"),
            sql=AuditMasker.mask_strict(meta.get("sql", ""), is_god_mode),

            details=details_with_prefix,
            raw_line=line
        )

    @classmethod
    def _parse_error_line(cls, line: str, is_god_mode: bool) -> Optional[LogEntry]:
        """
        [Phase 2.2.1] 专用于 error.log 的解析方法
        格式: Time | Ref | EventID | User/IP | System | ERROR | Failed | System Error | Message | Type | Note | Loc
        """
        line = (line or "").rstrip("\n")
        if not line.strip(): return None

        m = cls.LOG_PATTERN_ERROR.match(line)
        if not m:
            return None

        user_ip = m.group("user_ip").strip()
        if "/" in user_ip:
            user, ip = user_ip.split("/", 1)
        else:
            user, ip = user_ip, "-"

        # 从 message 中提取 action（如果包含特定关键词）
        message = m.group("message").strip()
        action = m.group("action").strip()  # 通常是 "ERROR"
        
        # 如果 message 以 "Business Fail:" 开头，提取 action
        if "Business Fail:" in message:
            action = "BUSINESS_FAIL"
        elif action == "ERROR":
            action = "SYSTEM_ERROR"

        return LogEntry(
            time=m.group("ts").strip(),
            reference=m.group("ref").strip(),
            user=user.strip(),
            ip=ip.strip(),
            source=LogSource.FILE,
            event_id=m.group("event_id").strip() if m.group("event_id") else "-",

            func="-",
            page=m.group("page").strip(),  # "System"
            
            action=action,
            target="-",  # error.log 固定无 target
            
            status="Failed(System)",  # 固定状态
            root_cause=m.group("root_cause").strip(),  # "System Error" 或具体原因
            
            type=m.group("type").strip(),
            note=m.group("note").strip(),

            snapshot_id="-",
            sql="-",

            details=f"[PARSE:ERROR] {message}",  # [Phase 3.2] 添加解析来源标记
            raw_line=line
        )

    @classmethod
    def get_file_logs(cls, filename: str,
                      q: str = "",
                      status: str = "ALL",
                      days: str = "7",
                      user: str = "ALL",
                      sort_by: str = "time",
                      sort_dir: str = "desc",
                      is_god_mode: bool = False,
                      max_lines: int = 2000) -> List[LogEntry]:
        """
        读取文件日志，支持所有筛选参数
        """
        log_path = settings.LOG_DIR / filename
        if not log_path.exists():
            return []

        entries = []
        try:
            days_int = int(days)
            cutoff_date = datetime.datetime.now() - datetime.timedelta(days=days_int)
            cutoff_str = cutoff_date.strftime("%Y-%m-%d")
        except:
            cutoff_str = "1970-01-01"

        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        # [Phase 2.2.1] 根据文件类型选择解析方法
        is_error_log = (filename == "error.log")
        
        for line in reversed(lines):
            if len(line) > 10 and line[:10] < cutoff_str:
                break

            # 使用对应的解析方法
            if is_error_log:
                entry = cls._parse_error_line(line, is_god_mode)
            else:
                entry = cls._parse_file_line(line, is_god_mode)
            if not entry: continue

            if user != "ALL" and entry.user != "System" and entry.user != user:
                continue

            if status == "SUCCESS":
                if "Success" not in entry.status and "SUCCESS" not in entry.status: continue
            elif status == "FAILED":
                if "Failed" not in entry.status and "FAILED" not in entry.status: continue

            if q:
                q_lower = q.lower()
                search_target = f"{entry.reference} {entry.page} {entry.action} {entry.details} {entry.note} {entry.type} {entry.sql}".lower()
                if q_lower not in search_target:
                    continue

            entries.append(entry)
            if len(entries) >= max_lines:
                break

        reverse = (sort_dir == "desc")
        if sort_by == "time":
            entries.sort(key=lambda x: x.time, reverse=reverse)
        elif sort_by == "user":
            entries.sort(key=lambda x: x.user, reverse=reverse)
        
        return entries

    @classmethod
    def get_db_audit_logs(
        cls,
        days: str = "7",
        is_god_mode: bool = False,
        q: str = "",
        status: str = "ALL",
        max_records: int = 1000
    ) -> List[LogEntry]:
        """
        [Phase 2.3] 从数据库读取审计记录
        
        字段映射:
        - ref_id -> reference
        - actor -> user
        - ip_address -> ip
        - page_hierarchy -> page
        - action -> action
        - target_model -> target
        - status -> status
        - root_cause -> root_cause
        - timestamp -> time
        - note + changes -> details
        """
        import datetime
        from backend.apps.audit.models import AuditLog
        
        try:
            days_int = int(days)
            cutoff = datetime.datetime.now() - datetime.timedelta(days=days_int)
        except:
            cutoff = datetime.datetime(1970, 1, 1)
        
        queryset = AuditLog.objects.filter(timestamp__gte=cutoff).order_by('-timestamp')[:max_records]
        
        # 应用筛选
        if q:
            queryset = queryset.filter(
                models.Q(ref_id__icontains=q) |
                models.Q(actor__icontains=q) |
                models.Q(target_model__icontains=q) |
                models.Q(action__icontains=q) |
                models.Q(note__icontains=q)
            )
        
        if status == "SUCCESS":
            queryset = queryset.filter(status__icontains="Success")
        elif status == "FAILED":
            queryset = queryset.filter(status__icontains="Failed")
        
        entries = []
        for record in queryset:
            # 构建 details
            details_parts = []
            if record.note:
                details_parts.append(str(record.note))
            if record.changes:
                try:
                    import json
                    details_parts.append(json.dumps(record.changes, ensure_ascii=False)[:200])
                except:
                    pass
            details = " | ".join(details_parts) or "-"
            
            entry = LogEntry(
                time=record.timestamp.strftime("%Y-%m-%d %H:%M:%S") if record.timestamp else "-",
                reference=record.ref_id or "-",
                user=record.actor or "System",
                ip=record.ip_address or "-",
                source="db",  # 标记来源为 db
                event_id="-",  # DB 暂无 event_id
                
                func="-",
                page=record.page_hierarchy or "-",
                
                action=record.action or "-",
                target=AuditMasker.mask_target(record.target_model or "-", is_god_mode),
                
                status=record.status or "Success",
                root_cause=record.root_cause or "-",
                
                type=record.log_type or "Regular",
                note=record.note or "-",
                
                snapshot_id=record.snapshot_path or "-",
                sql="-",
                
                details=AuditMasker.mask_sensitive_info(details, is_god_mode),
                raw_line=""
            )
            entries.append(entry)
        
        return entries

    @classmethod
    def get_unified_logs(cls,
                         q: str = "",
                         status: str = "ALL",
                         days: str = "7",
                         user: str = "ALL",
                         sort_by: str = "time",
                         sort_dir: str = "desc",
                         is_god_mode: bool = False) -> List[LogEntry]:
        """
        [核心] 双流合并日志 (DB + File)
        """
        # --- A. DB Logs (AuditLog) ---
        db_query = AuditLog.objects.all()

        try:
            days_int = int(days)
            start_time = timezone.now() - datetime.timedelta(days=days_int)
            db_query = db_query.filter(timestamp__gte=start_time)
        except:
            pass

        if user != "ALL":
            db_query = db_query.filter(actor=user)

        if status == "SUCCESS":
            db_query = db_query.filter(status__icontains="Success")
        elif status == "FAILED":
            db_query = db_query.filter(status__icontains="Failed")

        if q:
            db_query = db_query.filter(
                Q(ref_id__icontains=q) |
                Q(action__icontains=q) |
                Q(target_model__icontains=q) |
                Q(note__icontains=q) | 
                Q(changes__icontains=q)
            )

        db_entries = []
        for log in db_query.order_by('-timestamp')[:500]:
            details_str = str(log.changes)
            
            dto = LogEntry(
                time=log.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                reference=log.ref_id or f"DB-{log.id}", 
                user=log.actor or "System",
                ip=log.ip_address or "-",
                source=LogSource.DB,
                event_id="-",  # [Phase 0.5] DB 日志暂无 event_id
                
                func=f"{log.target_app}.{log.target_model}",
                page=log.page_hierarchy or "DB Direct",
                action=log.action,
                target=AuditMasker.mask_target(f"{log.target_model}:{log.target_id}", is_god_mode),

                status=log.status,
                root_cause=log.root_cause or "-",
                
                type=log.log_type,
                note=log.note or "",
                
                snapshot_id=log.snapshot_path or "-",
                sql=AuditMasker.mask_strict(str(log.underlying_data), is_god_mode),

                details=AuditMasker.mask_sensitive_info(details_str, is_god_mode),
                raw_line=""
            )
            db_entries.append(dto)

        # --- B. File Logs ---
        file_entries = []
        file_entries.extend(cls.get_file_logs("app.log", q, status, days, user, sort_by, sort_dir, is_god_mode, 300))
        file_entries.extend(cls.get_file_logs("audit.log", q, status, days, user, sort_by, sort_dir, is_god_mode, 300))

        merged = db_entries + file_entries
        
        reverse = (sort_dir == "desc")
        merged.sort(key=lambda x: x.time, reverse=reverse)

        return merged

    @classmethod
    def count_logs_by_range(cls, log_types: List[str], start_date: str, end_date: str) -> Dict[str, Any]:
        """
        [Phase 3.6] 统计指定日期范围内可清理的日志数量（仅统计，不删除）
        用于清空日志向导的 verify 步骤
        
        与 purge_logs 使用相同的过滤条件，确保 verify 与 execute 对齐
        
        Args:
            log_types: 日志类型列表 ['business', 'infra', 'system']
            start_date: 开始日期 'YYYY-MM-DD'
            end_date: 结束日期 'YYYY-MM-DD'
        
        Returns:
            {
                'business_count': int,
                'infra_count': int,
                'system_count': int,
                'db_count': int,
                'total': int,
                'has_data': bool
            }
        """
        result = {
            'business_count': 0,
            'infra_count': 0,
            'system_count': 0,
            'db_count': 0,
            'total': 0,
            'has_data': False
        }
        
        try:
            # 1. 统计 DB 日志 (infra 类型)
            if 'infra' in log_types:
                qs = AuditLog.objects.filter(
                    timestamp__date__range=[start_date, end_date]
                ).exclude(log_type="Permanent")
                result['db_count'] = qs.count()
                result['infra_count'] += result['db_count']
            
            # 2. 统计文件日志
            file_targets = []
            if 'business' in log_types:
                file_targets.append(('app.log', 'business_count'))
            if 'infra' in log_types:
                file_targets.append(('audit.log', 'infra_count'))
            if 'system' in log_types:
                file_targets.append(('error.log', 'system_count'))
            
            for fname, count_key in file_targets:
                fpath = settings.LOG_DIR / fname
                if not fpath.exists():
                    continue
                
                line_count = 0
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        date_match = line[:10]
                        if len(date_match) == 10 and date_match[0].isdigit():
                            log_date = date_match
                            if start_date <= log_date <= end_date:
                                # 排除 Permanent 类型
                                if "Permanent" not in line:
                                    line_count += 1
                
                result[count_key] += line_count
            
            # 3. 计算总数
            result['total'] = result['business_count'] + result['infra_count'] + result['system_count']
            result['has_data'] = result['total'] > 0
            
        except Exception as e:
            # 静默处理，返回空结果
            pass
        
        return result

    @classmethod
    def purge_logs(cls, log_types: List[str], start_date: str, end_date: str, user: str, reason: str) -> Tuple[bool, str, str]:
        """
        [Core] Secure Log Purge
        1. Create Backup (ref_TIMESTAMP_logname.txt) with Metdata.
        2. Delete from DB (non-permanent only).
        3. Delete from Files (rewrite file excluding range).
        """
        deleted_count = 0
        details_msg = []
        
        # 1. Setup Backup
        # 1. Setup Backup
        backup_dir = settings.LOG_ARCHIVE_DIR
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        ts_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        ref_id = f"ref_{ts_str}_purge"
        backup_filename = f"{ref_id}.txt"
        backup_path = backup_dir / backup_filename
        
        backup_content = []
        
        # Header
        backup_content.append(f"LOG PURGE BACKUP REPORT")
        backup_content.append(f"REF ID: {ref_id}")
        backup_content.append(f"Executed By: {user}")
        backup_content.append(f"Date: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        backup_content.append(f"Range: {start_date} to {end_date}")
        backup_content.append(f"Target Types: {', '.join(log_types)}")
        backup_content.append(f"Reason: {reason}")
        backup_content.append("-" * 60 + "\n")

        try:
            # 2. Infra/DB Purge
            if 'infra' in log_types:
                qs = AuditLog.objects.filter(
                    timestamp__date__range=[start_date, end_date]
                ).exclude(log_type="Permanent")
                
                if qs.exists():
                    backup_content.append(f"\n--- DB: Audit Logs ({qs.count()} records) ---")
                    for log in qs:
                        backup_content.append(
                            f"{log.timestamp} | {log.ref_id} | {log.actor} | {log.action} | {log.changes}"
                        )
                
                count = qs.count()
                qs.delete()
                deleted_count += count
                details_msg.append(f"DB Logs: {count}")

            # 3. File Purge
            file_targets = []
            if 'business' in log_types: file_targets.append('app.log')
            if 'infra' in log_types: file_targets.append('audit.log')
            if 'system' in log_types: file_targets.append('error.log')

            for fname in file_targets:
                fpath = settings.LOG_DIR / fname
                if not fpath.exists(): continue
                
                lines_kept = []
                lines_deleted = []
                
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        date_match = line[:10] 
                        if len(date_match) == 10 and date_match[0].isdigit():
                            log_date = date_match
                            if start_date <= log_date <= end_date:
                                if "Permanent" in line:
                                    lines_kept.append(line)
                                else:
                                    lines_deleted.append(line)
                            else:
                                lines_kept.append(line)
                        else:
                            lines_kept.append(line)

                if lines_deleted:
                    backup_content.append(f"\n--- FILE: {fname} ({len(lines_deleted)} lines) ---")
                    backup_content.extend(lines_deleted)
                    deleted_count += len(lines_deleted)
                    
                    with open(fpath, "w", encoding="utf-8") as f:
                        for l in lines_kept:
                            f.write(l)
                    details_msg.append(f"{fname}: {len(lines_deleted)}")

            # 4. Finalize Backup File
            with open(backup_path, "w", encoding="utf-8") as bf:
                bf.writelines(backup_content)

            return True, f"Purge Successful. Removed {deleted_count} items. Backup: {backup_filename}", backup_filename

        except Exception as e:
            return False, f"Purge Failed: {str(e)}", ""

    @classmethod
    def get_logs_by_ref(cls, ref_id: str, is_god_mode: bool = False) -> Dict[str, List[Any]]:
        """Get logs by Ref ID for detail view"""
        res = {"business": [], "infra": [], "system": []}
        
        app = cls.get_file_logs("app.log", q=ref_id, is_god_mode=is_god_mode)
        res["business"] = [x.to_dict() for x in app if ref_id in x.reference]
        
        infra = cls.get_file_logs("audit.log", q=ref_id, is_god_mode=is_god_mode)
        res["infra"] = [x.to_dict() for x in infra if ref_id in x.reference]

        err = cls.get_file_logs("error.log", q=ref_id, is_god_mode=is_god_mode)
        res["system"] = [x.to_dict() for x in err if ref_id in x.reference]
        
        return res

    # =========================================================================
    # [Phase 3.1] 事件语义稳定化
    # =========================================================================
    
    @classmethod
    def _normalize_status(cls, raw: str) -> tuple:
        """
        [Phase 3.1-A] 规范化 status 字段
        
        Returns:
            (normalized_status, extra_info)
            - extra_info: 括号内的信息，如 "System" from "Failed(System)"
        """
        raw = (raw or "").strip()
        
        # 提取括号内信息
        extra_info = ""
        if "(" in raw and ")" in raw:
            start = raw.index("(")
            end = raw.index(")")
            extra_info = raw[start+1:end]
        
        # 规范化规则
        raw_upper = raw.upper()
        if raw_upper.startswith("FAILED") or "FAILED" in raw_upper:
            return ("Failed", extra_info or "-")
        elif raw_upper.startswith("SUCCESS") or "SUCCESS" in raw_upper:
            return ("Success", "-")
        elif "DENIED" in raw_upper or "FORBIDDEN" in raw_upper:
            return ("Denied", extra_info or "-")
        else:
            # 未知状态，保留原样但归类
            return ("Unknown", raw if raw else "-")

    @classmethod  
    def _summarize_event_status(cls, entries: list) -> tuple:
        """
        [Phase 3.1-B] 汇总事件主状态
        
        优先级: Failed > Denied > Success > Unknown
        
        Returns:
            (status, root_cause)
        """
        has_failed = False
        has_denied = False
        has_success = False
        
        failed_root_cause = "-"
        
        # 按来源优先级排序收集 root_cause: error > audit > app > db
        source_priority = {"error": 0, "audit": 1, "app": 2, "db": 3}
        
        for entry in entries:
            norm_status, extra = cls._normalize_status(entry.status)
            
            if norm_status == "Failed":
                has_failed = True
                # 收集 root_cause（优先级排序）
                src = getattr(entry, "source", "app")
                current_priority = source_priority.get(src, 99)
                
                # 取最高优先级来源的 root_cause
                candidate = entry.root_cause if entry.root_cause and entry.root_cause != "-" else extra
                if candidate and candidate != "-":
                    # 检查是否需要更新（更高优先级）
                    if failed_root_cause == "-":
                        failed_root_cause = candidate
                    elif current_priority < source_priority.get("app", 99):
                        failed_root_cause = candidate
                        
            elif norm_status == "Denied":
                has_denied = True
            elif norm_status == "Success":
                has_success = True
        
        # 按优先级返回
        if has_failed:
            return ("Failed", failed_root_cause)
        elif has_denied:
            return ("Denied", "-")
        elif has_success:
            return ("Success", "-")
        else:
            return ("Unknown", "-")

    @classmethod
    def _select_main_action_target(cls, entries: list) -> tuple:
        """
        [Phase 3.1-C + 3.2] 稳定选择事件的主 action 和 target
        
        优先级: audit > app > db > error
        
        Returns:
            (action, target)
        """
        source_priority = {"audit": 0, "app": 1, "db": 2, "error": 3}
        
        # [Phase 3.2] 无效值列表（错位字段或状态词）
        INVALID_VALUES = {"-", "", "Success", "Failed", "Denied", "Unknown", "System Error", "System"}
        
        # 按来源优先级排序
        sorted_entries = sorted(entries, key=lambda e: source_priority.get(getattr(e, "source", "app"), 99))
        
        main_action = "-"
        main_target = "-"
        
        # 选择 action（排除无效值 + 系统自动 action）
        for entry in sorted_entries:
            if entry.action and entry.action not in INVALID_VALUES and entry.action not in ["SYSTEM_ERROR", "BUSINESS_FAIL"]:
                main_action = entry.action
                break
        
        # 如果还没找到，fallback 到任意非空（包括 SYSTEM_ERROR 等）
        if main_action == "-":
            for entry in sorted_entries:
                if entry.action and entry.action not in INVALID_VALUES:
                    main_action = entry.action
                    break
        
        # 选择 target（排除无效值）
        for entry in sorted_entries:
            if entry.target and entry.target not in INVALID_VALUES:
                main_target = entry.target
                break
        
        return (main_action, main_target)
    
    @classmethod
    def _generate_event_key(cls, entry: LogEntry) -> str:
        """
        生成事件聚合键
        规则：
        - 如果 event_id 非 "-"，使用 event_id
        - 否则使用 reference + user + ip + time_bucket(分钟级)
        """
        if entry.event_id and entry.event_id != "-":
            return f"evt:{entry.event_id}"
        
        # 使用 time[:16] 作为分钟级桶 (e.g., "2025-12-21 23:05")
        time_bucket = entry.time[:16] if len(entry.time) >= 16 else entry.time
        return f"ref:{entry.reference}:{entry.user}:{entry.ip}:{time_bucket}"

    @classmethod
    def get_unified_events(
        cls,
        days: str = "7",
        is_god_mode: bool = False,
        q: str = "",
        status: str = "ALL",
        limit: int = 100
    ) -> List:
        """
        [Phase 2.1] 获取统一事件列表
        从 app.log, audit.log, error.log 聚合日志为事件
        
        Returns:
            List[UnifiedEvent]: 事件列表，按 last_time 倒序
        """
        from backend.apps.audit.core.dto import UnifiedEvent
        from collections import defaultdict
        
        # 1. 收集所有日志
        all_entries: List[LogEntry] = []
        
        # app.log (business)
        app_logs = cls.get_file_logs("app.log", q=q, status=status, days=days, is_god_mode=is_god_mode)
        for e in app_logs:
            e.source = "app"
        all_entries.extend(app_logs)
        
        # audit.log (infra)
        audit_logs = cls.get_file_logs("audit.log", q=q, status=status, days=days, is_god_mode=is_god_mode)
        for e in audit_logs:
            e.source = "audit"
        all_entries.extend(audit_logs)
        
        # error.log (system)
        error_logs = cls.get_file_logs("error.log", q=q, status=status, days=days, is_god_mode=is_god_mode)
        for e in error_logs:
            e.source = "error"
        all_entries.extend(error_logs)
        
        # [Phase 2.3] db.audit (database)
        db_logs = cls.get_db_audit_logs(days=days, is_god_mode=is_god_mode, q=q, status=status)
        for e in db_logs:
            e.source = "db"
        all_entries.extend(db_logs)
        
        # 2. 按 event_key 分组
        event_groups: Dict[str, List[LogEntry]] = defaultdict(list)
        for entry in all_entries:
            key = cls._generate_event_key(entry)
            event_groups[key].append(entry)
        
        # 3. 构建 UnifiedEvent 列表
        events: List[UnifiedEvent] = []
        
        for event_key, entries in event_groups.items():
            if not entries:
                continue
            
            # 按时间排序 entries
            entries.sort(key=lambda x: x.time)
            
            # 取第一个/最后一个 entry 作为时间范围
            first = entries[0]
            last = entries[-1]
            
            # [Phase 3.1-B] 使用规范化汇总函数
            final_status, root_cause = cls._summarize_event_status(entries)
            
            # [Phase 2.3] 统计来源（增加 db）
            counts = {"app": 0, "audit": 0, "error": 0, "db": 0}
            for e in entries:
                src = getattr(e, "source", "app")
                if src in counts:
                    counts[src] += 1
            
            # [Phase 3.1-C] 使用稳定的 action/target 选择
            main_action, main_target = cls._select_main_action_target(entries)
            
            event = UnifiedEvent(
                event_key=event_key,
                reference=first.reference,
                event_id=first.event_id,
                user=first.user,
                ip=first.ip,
                page=first.page,
                action=main_action,
                target=AuditMasker.mask_target(main_target, is_god_mode),
                first_time=first.time,
                last_time=last.time,
                status=final_status,
                root_cause=root_cause,
                entries=entries,
                counts_by_source=counts
            )
            events.append(event)
        
        # 4. 按 last_time 倒序排序
        events.sort(key=lambda x: x.last_time, reverse=True)
        
        # 5. 限制返回数量
        return events[:limit]