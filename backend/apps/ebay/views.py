# File: backend/apps/ebay/views.py
"""
eBay Integration Web Views

提供 OAuth 授权流程和同步管理的 Web 界面。
"""
import uuid
from datetime import datetime, timedelta
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.contrib import messages
from django.http import HttpResponse

from core.services.ebay import EbayConfig, EbayOAuthManager, EbaySyncService
from .models import EbayAccount


# 存储 OAuth state (生产环境应使用 Redis/数据库)
_oauth_states = {}


@login_required
def dashboard(request):
    """
    eBay 集成仪表板
    
    显示当前连接状态和同步选项。
    """
    config = EbayConfig.get_config()
    accounts = EbayAccount.objects.filter(is_active=True).order_by('-last_sync_at', '-created_at')
    
    # 兼容旧逻辑：如果 session 有 token 但 DB 没有，提示用户重新授权
    # 或者我们只是展示 Account 列表
    
    context = {
        'page_title': 'eBay Integration',
        'accounts': accounts,
        'config': {
            'environment': config.environment.value,
            'is_configured': config.is_configured(),
        },
    }
    
    return render(request, 'ebay/dashboard.html', context)


@login_required
def authorize(request):
    """
    开始 OAuth 授权流程
    
    生成授权 URL 并重定向用户到 eBay 登录页面。
    """
    config = EbayConfig.get_config()
    oauth = EbayOAuthManager(config)
    
    # 生成防 CSRF 的 state
    state = str(uuid.uuid4())
    
    # [Fix] 使用 Session 存储 state，防止服务器重启丢失 (Persist across reloads)
    request.session['ebay_oauth_state'] = {
        'state': state,
        'user_id': request.user.id,
        'timestamp': datetime.now().timestamp(),
    }
    
    auth_url = oauth.get_authorization_url(state=state)
    
    return redirect(auth_url)


@login_required
def oauth_callback(request):
    """
    OAuth 回调处理
    
    eBay 授权完成后会重定向到这里，附带 authorization code。
    """
    # 获取参数
    code = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')
    error_description = request.GET.get('error_description')
    
    # 检查错误
    if error:
        messages.error(request, f'eBay 授权失败: {error_description or error}')
        return redirect('ebay:dashboard')
    
    # 验证 state (从 Session 获取)
    stored_state_data = request.session.get('ebay_oauth_state')
    
    if not stored_state_data:
        messages.error(request, '授权会话已过期，请重试')
        return redirect('ebay:dashboard')
        
    if stored_state_data.get('state') != state:
        messages.error(request, '无效的授权请求 (state 不匹配)')
        return redirect('ebay:dashboard')
        
    # 清除 session state
    del request.session['ebay_oauth_state']
    
    # 交换 Token
    if code:
        config = EbayConfig.get_config()
        oauth = EbayOAuthManager(config)
        
        result = oauth.exchange_code_for_token(code)
        
        if result.get('success'):
            access_token = result.get('access_token')
            refresh_token = result.get('refresh_token')
            expires_in = result.get('expires_in', 7200)
            
            # 获取用户信息
            user_info = oauth.get_user_info(access_token)
            ebay_user_id = user_info.get('userId')
            ebay_username = user_info.get('username')
            
            if not ebay_user_id:
                # 尝试再次获取或记录详细错误
                oauth.log(f"❌ Failed to identify user. Info received: {user_info}", level="error")
                error_detail = user_info.get('details', 'Unknown')
                status_code = user_info.get('status_code', 'N/A')
                url = user_info.get('url', 'N/A')
                messages.error(request, f'Identity Error ({status_code}) at {url}: {error_detail}')
            else:
                if not ebay_username:
                     ebay_username = f"User_{ebay_user_id}"

                # 保存到数据库
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
                messages.success(request, f'✅ eBay 账户 {ebay_username} 授权成功！')
        else:
            messages.error(request, f'Token 获取失败: {result.get("error_description")}')
    
    return redirect('ebay:dashboard')


@login_required
@require_POST
def disconnect_account(request, account_id):
    """在此处解除特定账户授权"""
    account = get_object_or_404(EbayAccount, id=account_id)
    # 允许管理员或拥有者删除
    if request.user.is_superuser or account.user == request.user:
        account.delete()
        messages.success(request, '账户授权已解除。')
    else:
        messages.error(request, '无权操作此账户。')
        
    return redirect('ebay:dashboard')


@login_required
def sync_page(request):
    """
    数据同步页面
    
    显示同步选项和历史记录。
    """
    # 暂时只支持查看状态，具体同步逻辑需要重构为支持多账户
    # 此时可以列出所有账户供选择同步
    accounts = EbayAccount.objects.filter(is_active=True)
    
    context = {
        'page_title': 'eBay Data Sync',
        'accounts': accounts,
    }
    
    return render(request, 'ebay/sync.html', context)
