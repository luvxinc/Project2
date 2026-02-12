# core/services/security/policy_manager.py
"""
文件说明: 安全策略管理器 (Security Policy Manager) - V5.2 Hot Reload
主要功能:
1. 提供 L0-L4 密码映射标准。
2. 提供统一的请求校验接口 verify_action_request。
3. [Fix] 智能热更新: 自动检测配置文件修改时间，实现策略变更即时生效，无需重启。
"""

import json
import os
from typing import List, Dict, Any, Tuple

from backend.common.settings import settings
from backend.core.services.auth.service import AuthService
from backend.core.sys.logger import get_logger
from backend.apps.audit.core.dto import LogStatus, LogType

logger = get_logger("SecurityPolicy")


class SecurityPolicyManager:
    _registry_cache: Dict[str, Any] = {}
    _overrides_cache: Dict[str, List[str]] = {}
    _last_mtime: float = 0.0  # [Fix] 记录文件最后修改时间
    _is_initialized = False

    OVERRIDES_FILE = settings.DATA_DIR / "security_overrides.json"
    CAPABILITIES_FILE = settings.DATA_DIR / "admin_capabilities.json"

    # [核心] 令牌与环境变量的映射
    TOKEN_MAP = {
        "user": {"level": "L0", "env": None, "label": "当前用户密码", "code_key": "sec_code_l0"},
        "query": {"level": "L1", "env": "SEC_CODE_QUERY", "label": "查询安保码 (L1)", "code_key": "sec_code_l1"},
        "modify": {"level": "L2", "env": "SEC_CODE_MODIFY", "label": "修改安保码 (L2)", "code_key": "sec_code_l2"},
        "db": {"level": "L3", "env": "SEC_CODE_DB", "label": "数据库管理码 (L3)", "code_key": "sec_code_l3"},
        "system": {"level": "L4", "env": "SEC_CODE_SYSTEM", "label": "系统核弹码 (L4)", "code_key": "sec_code_l4"},
    }

    @classmethod
    def reset_cache(cls):
        """[New] 强制清除策略缓存，并触发立即重新加载"""
        cls._registry_cache = {}
        cls._overrides_cache = {}
        cls._last_mtime = 0.0
        cls._is_initialized = False

        try:
            cls._check_and_reload()
            # [Fix]: 使用 logger.info 并明确标记 status=SUCCESS
            logger.info("SecurityPolicyManager 策略缓存已强制重置。",
                        extra={"action": "CACHE_RESET", "status": LogStatus.SUCCESS})
        except Exception as e:
            # 如果重置失败，使用 ERROR 级别，并标记为系统故障
            logger.error(f"SecurityPolicyManager 策略缓存重置失败: {e}",
                         extra={"action": "CACHE_RESET_FAIL",
                                "status": LogStatus.FAIL_SYS,
                                "root_cause": str(e)})

    @classmethod
    def _check_and_reload(cls):
        """[内部方法] 检查文件变更并热重载"""
        # 1. 始终先加载一次静态注册表 (Base Config)
        if not cls._is_initialized:
            data = settings.load_action_registry()
            flat_map = {}
            if "modules" in data:
                for mod in data["modules"]:
                    # [Fix] 遍历所有 tabs (包括 submodules 内的)
                    all_tabs = mod.get("tabs", [])
                    for sub in mod.get("submodules", []):
                        all_tabs.extend(sub.get("tabs", []))
                    
                    for tab in all_tabs:
                        for act in tab.get("actions", []):
                            key = act.get("key")
                            if key: flat_map[key] = act
            cls._registry_cache = flat_map
            cls._is_initialized = True

        # 2. 检查 overrides 文件是否更新
        # ... (保持检查文件时间戳的逻辑不变) ...
        if not cls.OVERRIDES_FILE.exists():
            cls._overrides_cache = {}
            return

        try:
            current_mtime = os.path.getmtime(cls.OVERRIDES_FILE)
            # 如果文件时间戳变了，或者缓存为空，则重载
            if current_mtime > cls._last_mtime or not cls._overrides_cache:
                with open(cls.OVERRIDES_FILE, "r", encoding="utf-8") as f:
                    cls._overrides_cache = json.load(f)

                cls._last_mtime = current_mtime
                logger.info(f"安全策略已热更新 (Mtime: {current_mtime})")
        except Exception as e:
            logger.error(f"策略热重载失败: {e}")
            # 保持旧缓存，防止系统崩溃

    @classmethod
    def get_required_tokens(cls, action_key: str) -> List[str]:
        """获取某个动作当前需要的所有 Token 类型"""
        # [Fix] 每次获取前先检查是否有更新
        cls._check_and_reload()

        # 1. 优先读取覆盖配置
        if action_key in cls._overrides_cache:
            return cls._overrides_cache[action_key]

        # 2. 读取默认配置
        config = cls._registry_cache.get(action_key)
        if not config: return []
        return config.get("default_security", [])

    @classmethod
    def validate_single_token(cls, token_type: str, input_value: str, request) -> bool:
        """验证单个令牌"""
        if not input_value: return False

        token_type = token_type.lower()
        if token_type not in cls.TOKEN_MAP: return False

        # L0: 用户密码校验 (仅验证，不刷新 token)
        if token_type == "user":
            username = request.user.username
            return AuthService.verify_password_only(username, input_value)

        # L1-L4: 环境变量校验
        env_key = cls.TOKEN_MAP[token_type]["env"]
        correct_code = getattr(settings, env_key, None)
        return str(input_value).strip() == str(correct_code).strip()

    @classmethod
    def verify_action_request(cls, request, action_key: str, json_data: dict = None) -> Tuple[bool, str]:
        """
        [公有类方法] 校验当前请求是否满足 Action 的安全策略
        
        [Fix 2026-01-03] 支持从 JSON body 或 POST 表单读取密码参数：
        - 前端 fetch + JSON.stringify() 发送时，数据在 request.body
        - 前端表单 POST 发送时，数据在 request.POST
        
        [Fix 2026-01-11] 新增 json_data 参数：
        - 如果调用者已解析 request.body，可以传入解析后的 dict
        - 避免 Request Body Stream Exhaustion 问题
        """
        required_tokens = cls.get_required_tokens(action_key)

        if not required_tokens:
            return True, "No security required"

        # [Fix 2026-01-11] 使用传入的 json_data 或尝试解析 body
        json_body = json_data or {}
        if not json_body and request.content_type == 'application/json' and hasattr(request, 'body'):
            try:
                import json as _json
                json_body = _json.loads(request.body.decode('utf-8'))
            except Exception:
                pass  # 解析失败时使用空字典

        for token in required_tokens:
            meta = cls.TOKEN_MAP.get(token)
            if not meta: continue

            input_key = meta["code_key"]  # e.g., sec_code_l4
            # [Fix] 优先从 POST 读取，fallback 到 JSON body
            input_val = request.POST.get(input_key, "").strip()
            if not input_val and input_key in json_body:
                input_val = str(json_body[input_key]).strip()

            if not input_val:
                return False, f"缺少验证码: {meta['label']}"

            if not cls.validate_single_token(token, input_val, request):
                return False, f"验证失败: {meta['label']} 错误"

        return True, "Security Check Passed"

    @classmethod
    def get_admin_capability(cls, cap_key: str) -> bool:
        """获取职能开关状态 (始终读盘，因为改动频率低)"""
        if not cls.CAPABILITIES_FILE.exists(): return True
        try:
            with open(cls.CAPABILITIES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get(cap_key, True)
        except:
            return True
