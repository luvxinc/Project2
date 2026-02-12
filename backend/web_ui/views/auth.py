# File: backend/web_ui/views/auth.py
from django.shortcuts import render, redirect
from django.contrib.auth import login, logout
from backend.common.settings import settings as app_settings
from backend.web_ui.forms import LoginForm

def login_view(request):
    if request.user.is_authenticated:
        return redirect('web_ui:home')
    
    lock_error = None  # 锁定错误提示
    
    if request.method == 'POST':
        form = LoginForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            
            # [单点登录] 从 auth backend 获取新生成的 token 并存入 Django session
            # token 是在 LegacyAuthBackend.authenticate() 中刷新的
            new_token = getattr(request, '_new_auth_token', None)
            if new_token:
                request.session['auth_token'] = new_token
            
            next_url = request.GET.get('next')
            if next_url: return redirect(next_url)
            return redirect('web_ui:home')
        else:
            # 检查是否因账户锁定而失败
            if getattr(request, '_user_locked', False):
                lock_error = "账户已被锁定，请联系管理员解锁。"
    else:
        form = LoginForm()
        
    # Get Version Info directly from parser to be consistent
    from backend.common.patch_parser import parse_patch_notes
    from backend.common.settings import settings
    
    # Try using Settings path first
    patch_file = settings.PATCH_NOTES_FILE
    notes, version = parse_patch_notes(patch_file)
    
    return render(request, "pages/login.html", {"form": form, "version": version, "lock_error": lock_error})

def logout_view(request):
    # [清理] 登出时清空用户的报表文件
    if request.user.is_authenticated:
        try:
            from core.sys.context import set_current_user
            from core.services.report_manager import ReportFileManager
            
            # 设置上下文以确保 ReportFileManager 获取正确的用户目录
            set_current_user(request.user.username)
            mgr = ReportFileManager()
            mgr.clear_all_reports()
        except Exception as e:
            # 不要因为清理失败而阻止登出
            pass
    
    logout(request)
    return redirect('web_ui:login')