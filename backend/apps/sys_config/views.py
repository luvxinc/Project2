# File: backend/apps/sys_config/views.py
"""
# ==============================================================================
# 模块名称: 系统配置 API (System Config API)
# ==============================================================================
#
# [Purpose / 用途]
# 为前端提供动态的系统初始化配置 (Modules, Actions, Security Policies)。
#
# [Architecture / 架构]
# - Source: JSON Config Files (config/*.json).
# - Strategy: Read-on-Demand (每次请求实时读取，支持热加载)。
#
# [ISO Compliance / 合规性]
# - 可配置性: 敏感动作 (Delete/Purge) 的权限可通过 JSON 配置动态调整，无需重构代码。
#
# ==============================================================================
"""

import json
import os
from django.http import JsonResponse
from backend.common.settings import settings


def get_system_config(request):
    """
    [API Endpoint] GET /api/sys/config/

    功能:
        聚合系统的核心配置文件，返回给客户端用于初始化 UI。

    返回结构:
        {
            "modules": [...],  # 来自 modules.json (导航菜单)
            "actions": {...},  # 来自 action_registry.json (权限注册表)
            "status": "success"
        }
    """
    # 1. 路径定位
    # settings.BASE_DIR 指向 backend 目录
    # config 目录在 backend 的上一级
    project_root = settings.BASE_DIR.parent
    config_dir = project_root / "config"

    modules_path = config_dir / "modules.json"
    registry_path = config_dir / "action_registry.json"

    # 2. 准备默认响应结构
    data = {
        "modules": [],
        "actions": {},
        "status": "success",
        "meta": {
            "source": "backend_local_config",
            "config_dir": str(config_dir)
        }
    }

    try:
        # 3. 读取 modules.json (导航菜单)
        if modules_path.exists():
            with open(modules_path, "r", encoding="utf-8") as f:
                # 使用 json.load 解析，如果格式错误会抛出 JSONDecodeError
                data["modules"] = json.load(f)
        else:
            print(f"⚠️ Warning: Config file not found at {modules_path}")

        # 4. 读取 action_registry.json (动作与安全策略)
        if registry_path.exists():
            with open(registry_path, "r", encoding="utf-8") as f:
                data["actions"] = json.load(f)
        else:
            print(f"⚠️ Warning: Registry file not found at {registry_path}")

    except json.JSONDecodeError as e:
        # 捕获 JSON 语法错误，方便调试
        return JsonResponse({
            "status": "error",
            "message": f"Config JSON syntax error: {str(e)}",
            "error_type": "JSONDecodeError"
        }, status=500)

    except Exception as e:
        # 捕获其他 IO 错误
        return JsonResponse({
            "status": "error",
            "message": f"Unexpected error reading config: {str(e)}",
            "error_type": type(e).__name__
        }, status=500)

    # 5. 返回成功响应
    return JsonResponse(data)