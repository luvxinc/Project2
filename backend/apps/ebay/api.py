# File: backend/apps/ebay/api.py
"""
eBay Integration REST API

提供 RESTful 接口供前端 AJAX 调用。
"""
import json
import uuid
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from datetime import datetime, timedelta

from core.services.ebay import EbayConfig, EbayOAuthManager, EbaySyncService
from .models import EbayAccount


def _get_config_for_account(request, account_id=None):
    """
    获取指定账户的 Config，并确保 Token 有效
    """
    config = EbayConfig.get_config()
    account = None
    
    if account_id:
        account = get_object_or_404(EbayAccount, id=account_id)
    else:
        # 如果未指定，尝试获取当前用户的第一个活跃账户
        account = EbayAccount.objects.filter(user=request.user, is_active=True).order_by('-last_sync_at').first()
    
    if not account:
        return config, None

    # check expiration and refresh if needed
    # using strict text comparison or datetime check
    # Localize logic
    now_ts = datetime.now()
    if account.token_expiry and account.token_expiry.tzinfo:
         # simple naive comparison if tz aware (unlikely to be set in this simple implementation)
         pass 

    # 简单检查：如果不到5分钟这就过期
    is_expired = False
    if account.token_expiry:
        # Django models usually return naive datetime if USE_TZ=False, or aware if True. 
        # Assuming naive for now based on previous code usage
        if account.token_expiry < datetime.now() + timedelta(minutes=5):
            is_expired = True
    else:
        is_expired = True
        
    if is_expired and account.refresh_token:
        # Refresh Logic
        oauth = EbayOAuthManager(config)
        refresh_result = oauth.refresh_access_token(account.refresh_token)
        
        if refresh_result.get('success'):
            account.access_token = refresh_result.get('access_token')
            # Refresh token might be rotated
            if refresh_result.get('refresh_token'):
                account.refresh_token = refresh_result.get('refresh_token')
            
            expires_in = refresh_result.get('expires_in', 7200)
            account.token_expiry = datetime.now() + timedelta(seconds=expires_in)
            account.save()
            # Log success?
    
    # Configure Config
    config.user_access_token = account.access_token
    config.refresh_token = account.refresh_token
    
    return config, account


@login_required
@require_http_methods(["GET"])
def get_status(request):
    """
    获取 GLOBAL 或 DEFAULT 状态
    """
    # 简单返回配置状态，具体账户状态现在由 Dashboard 渲染
    config = EbayConfig.get_config()
    return JsonResponse({
        "success": True,
        "is_configured": config.is_configured(),
        "environment": config.environment.value,
    })


@login_required
@require_http_methods(["GET"])
def get_auth_url(request):
    """获取 OAuth 授权 URL"""
    config = EbayConfig.get_config()
    oauth = EbayOAuthManager(config)
    auth_url = oauth.get_authorization_url()
    return JsonResponse({
        "success": True,
        "auth_url": auth_url,
        "environment": config.environment.value,
    })


@login_required
@require_http_methods(["POST"])
def disconnect(request):
    """
    API 方式断开 (已废弃，现在使用 views.disconnect_account)
    保留用于兼容旧前端调用
    """
    return JsonResponse({
        "success": True,
        "message": "Use newer disconnect method per account",
    })


@login_required
@require_http_methods(["POST"])
def exchange_code(request):
    """
    手动交换 Code (Manual Fallback)
    并创建/更新 Account
    """
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON"}, status=400)
    
    code = body.get('code')
    if not code:
        return JsonResponse({"success": False, "error": "Missing authorization code"}, status=400)
    
    config = EbayConfig.get_config()
    oauth = EbayOAuthManager(config)
    
    result = oauth.exchange_code_for_token(code)
    
    if result.get('success'):
        access_token = result.get('access_token')
        refresh_token = result.get('refresh_token')
        expires_in = result.get('expires_in', 7200)
        
        # Get Identity
        user_info = oauth.get_user_info(access_token)
        ebay_user_id = user_info.get('userId')
        ebay_username = user_info.get('username') or f"User_{ebay_user_id}" or "Unknown User"
        
        if not ebay_user_id:
             ebay_user_id = ebay_username if ebay_username != "Unknown User" else f"unknown_{uuid.uuid4().hex[:8]}"

        # Save to DB
        EbayAccount.objects.update_or_create(
            ebay_user_id=ebay_user_id,
            defaults={
                'user': request.user,
                'ebay_username': ebay_username,
                'access_token': access_token,
                'refresh_token': refresh_token,
                'token_expiry': datetime.now() + timedelta(seconds=expires_in),
                'environment': config.environment.value,
                'is_active': True,
                'updated_at': datetime.now(),
            }
        )
        
        return JsonResponse({
            "success": True,
            "message": f"Successfully connected account: {ebay_username}",
        })
    else:
        return JsonResponse({
            "success": False,
            "error": result.get('error', 'Unknown error'),
            "error_description": result.get('error_description', ''),
        }, status=400)


@login_required
@require_http_methods(["POST"])
def sync_orders(request):
    """同步订单"""
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        body = {}
        
    account_id = body.get('account_id')
    config, account = _get_config_for_account(request, account_id)
    
    if not config.has_valid_token():
        return JsonResponse({
            "success": False, 
            "error": "No valid account found or authorized."
        }, status=401)
        
    start_date = None
    if body.get('start_date'):
        start_date = datetime.strptime(body['start_date'], '%Y-%m-%d')
        
    end_date = None
    if body.get('end_date'):
        end_date = datetime.strptime(body['end_date'], '%Y-%m-%d')
        
    sync_service = EbaySyncService(config)
    result = sync_service.sync_orders(start_date=start_date, end_date=end_date)
    
    # Update last sync time
    if account:
        account.last_sync_at = datetime.now()
        account.save()
        
    return JsonResponse(result)


@login_required
@require_http_methods(["POST"])
def sync_finances(request):
    """同步财务"""
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        body = {}
        
    account_id = body.get('account_id')
    config, account = _get_config_for_account(request, account_id)
    
    if not config.has_valid_token():
        return JsonResponse({
            "success": False, 
            "error": "No valid account found or authorized."
        }, status=401)
        
    start_date = None
    if body.get('start_date'):
        start_date = datetime.strptime(body['start_date'], '%Y-%m-%d')
        
    end_date = None
    if body.get('end_date'):
        end_date = datetime.strptime(body['end_date'], '%Y-%m-%d')

    sync_service = EbaySyncService(config)
    result = sync_service.sync_finances(start_date=start_date, end_date=end_date)
    
    if account:
        account.last_sync_at = datetime.now()
        account.save()
        
    return JsonResponse(result)


@login_required
@require_http_methods(["POST"])
def sync_all(request):
    """全量同步 (Legacy: Syncs first account or specified)"""
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        body = {}
        
    account_id = body.get('account_id')
    config, account = _get_config_for_account(request, account_id)
    
    if not config.has_valid_token():
        return JsonResponse({
            "success": False, 
            "error": "No valid account found or authorized."
        }, status=401)

    sync_service = EbaySyncService(config)
    result = sync_service.sync_all(
        start_date=start_date,
        end_date=end_date,
    )
    
    if account:
        account.last_sync_at = datetime.now()
        account.save()
        
    return JsonResponse(result)
