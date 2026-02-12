from typing import Any, Dict, Optional
import json
import time
import requests
import random
from datetime import datetime

from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from backend.core.sys.logger import get_error_logger, get_audit_logger
from backend.core.services.security.policy_manager import SecurityPolicyManager

error_logger = get_error_logger()
audit_logger = get_audit_logger()


@require_POST
def log_client_error(request):
    """
    [API] 接收前端上报的日志 (系统故障 或 业务操作审计)
    Payload:
      {
        "type": "AUDIT" | "ERROR",
        "message": "...",
        "details": {...}
      }
    """
    try:
        data = json.loads(request.body)
        log_type = data.get('type', 'Client Error').upper()
        msg = data.get('message', 'Unknown Event')
        details = data.get('details', {})
        
        user = request.user.username if request.user.is_authenticated else "Anonymous"

        if log_type == 'AUDIT':
            # 记录到 audit.log (业务操作日志)
            audit_logger.info(
                msg,
                extra={
                    "user": user,
                    "func": "Frontend:Reports", # Default, can be overridden
                    "action": details.get('action', 'CLIENT_ACTION'),
                    "file": details.get('file', 'N/A')
                }
            )
        else:
            # 记录到 error.log (系统故障)
            # 构造详细堆栈信息供 System Tab 显示
            details_str = json.dumps(data, indent=2, ensure_ascii=False)
            error_logger.error(
                f"Frontend Fault: {msg}",
                extra={
                    "user": user,
                    "func": "Frontend:UI",
                    "action": "CLIENT_ERROR",
                    "root_cause": log_type,
                    "error_path": data.get('url', 'Browser'),
                    "error_func": "JS_Runtime",
                    "details": details_str
                }
            )
            
        return JsonResponse({"status": "logged"})
    except Exception:
        return JsonResponse({"status": "failed"}, status=400)

def get_task_progress(request):
    """
    [API] 获取后台任务进度 (Polling)
    URL: /api/sys/task_progress?key=xxx
    """
    task_key = request.GET.get('key')
    if not task_key:
        return JsonResponse({"percent": 0, "status": ""})
        
    from django.core.cache import cache
    data = cache.get(f"db_task_{task_key}")
    
    if not data:
        # 任务不存在或已过期
        return JsonResponse({"percent": 0, "status": "Waiting..."})
        
    return JsonResponse(data)


def get_client_ip(request) -> str:
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR') or "0.0.0.0"


@require_GET
def get_user_environment(request):
    """
    [API] 获取用户环境信息 (IP, City, Weather, Smart Greeting)
    """
    try:
        # 1. 获取 IP
        ip = get_client_ip(request)
        
        # 2. 获取地理位置 (ip-api.com) - 免费，无需 key (限频: 45/min)
        # 如果是内网 IP，ip-api 会失败，做个兜底
        city = "Unknown City"
        country = "Unknown Country"
        lat = 0
        lon = 0
        
        try:
            # 这里的 endpoint 可以换成 HTTPS 如果支持
            resp = requests.get(f"http://ip-api.com/json/{ip}?lang=zh-CN", timeout=2)
            if resp.status_code == 200:
                data = resp.json()
                if data.get('status') == 'success':
                    city = data.get('city', city)
                    country = data.get('country', country)
                    lat = data.get('lat')
                    lon = data.get('lon')
        except Exception:
            pass # Fail silently

        # 3. 获取天气 (wttr.in) - 免费
        # 格式化: %C (Condition), %t (Temp)
        weather_desc = "晴"
        weather_emoji = "☀️"
        temp = "25°C"
        
        try:
            # 如果有经纬度，用经纬度更准
            query = f"{lat},{lon}" if lat and lon else city
            # format=%C+%t -> Condition Temp (e.g. Sunny +25°C)
            # format=3 -> Simple format
            # wttr.in 有时候不稳定，兜底
            w_resp = requests.get(f"https://wttr.in/{query}?format=%C|%t&lang=zh-CN", timeout=2)
            if w_resp.status_code == 200:
                parts = w_resp.text.strip().split('|')
                if len(parts) >= 2:
                    weather_desc = parts[0].strip() # 晴
                    temp = parts[1].strip() # +25°C
                    
            # 简单的 Emoji 映射 (根据描述)
            if "雨" in weather_desc: weather_emoji = "🌧️"
            elif "云" in weather_desc: weather_emoji = "☁️"
            elif "阴" in weather_desc: weather_emoji = "☁️"
            elif "雪" in weather_desc: weather_emoji = "❄️"
            elif "雷" in weather_desc: weather_emoji = "⛈️"
            elif "雾" in weather_desc: weather_emoji = "🌫️"
            elif "晴" in weather_desc: weather_emoji = "☀️"
            
        except Exception:
            pass

        # 4. 智能关怀语生成
        # 规则: 时间段 + 天气
        now = datetime.now()
        hour = now.hour
        greeting = "你好，每一天都是新的开始。"
        
        # 时间段
        if 5 <= hour < 9:
            time_msg = "一日之计在于晨，早安！"
        elif 9 <= hour < 12:
            time_msg = "上午好，保持专注，效率满满。"
        elif 12 <= hour < 14:
            time_msg = "午安，记得小憩片刻，补充精力。"
        elif 14 <= hour < 18:
            time_msg = "下午好，继续加油，工作顺利。"
        elif 18 <= hour < 22:
            time_msg = "晚上好，愿你度过一个轻松愉快的夜晚。"
        else:
            time_msg = "夜深了，注意休息，早点睡觉哦。"
            
        # 天气加成
        weather_msg = ""
        if "雨" in weather_desc:
            weather_msg = "外面下雨了，出门记得带伞。"
        elif "雪" in weather_desc:
            weather_msg = "雪花纷飞，注意保暖防寒。"
        elif "晴" in weather_desc or "Sun" in weather_desc:
            weather_msg = "阳光明媚，心情也会跟着变好呢。"
        
        # 组合
        if weather_msg:
            greeting = f"{time_msg} {weather_msg}"
        else:
            greeting = time_msg

        return JsonResponse({
            "ip": ip,
            "city": city,
            "country": country,
            "weather": f"{weather_desc} {temp}", # 晴 +25°C
            "weather_emoji": weather_emoji,
            "greeting": greeting
        })
        
    except Exception as e:
        error_logger.error(f"Failed to get user env: {e}")
        return JsonResponse({
            "ip": "Unknown",
            "city": "Unknown", 
            "country": "Unknown",
            "weather": "-",
            "weather_emoji": "🌤️",
            "greeting": "你好，祝你今天过得愉快。"
        })


@require_GET
def get_security_requirements(request):
    """
    [API] Check security requirements for a given action
    URL: /api/sys/security_requirements?action=xxx
    Method: GET
    Resp: { required_codes: ['user', 'l4'], status: 'ok' }
    """
    action_key = request.GET.get('action')
    if not action_key:
        return JsonResponse({"status": "error", "message": "Missing action key"}, status=400)
        
    try:
        required = SecurityPolicyManager.get_required_tokens(action_key)
        
        # [P0-2] Fail-closed: Ensure action key is registered
        # Accessing private members to verify existence strictly
        if action_key not in SecurityPolicyManager._registry_cache and \
           action_key not in SecurityPolicyManager._overrides_cache:
             return JsonResponse({
                 "status": "error", 
                 "message": f"Security Policy Block: Action '{action_key}' is not registered."
             }, status=400)

        # Compatible with legacy return
        if required is None: required = []
        
        # [P0-1] Map to Slots (l0, l1...)
        required_slots = []
        token_map = SecurityPolicyManager.TOKEN_MAP
        for token in required:
            meta = token_map.get(token)
            if meta and 'level' in meta:
                required_slots.append(meta['level'].lower()) # l0, l1...
                
        return JsonResponse({"status": "ok", "required_slots": required_slots})
    except Exception as e:
        error_logger.error(f"Security Requirement Check Failed: {e}")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)